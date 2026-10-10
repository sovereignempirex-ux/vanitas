"""YouTube video search — real results only, never invented.

Port of `searchYouTubeVideos`, `decodeHtmlEntities` and
`searchYouTubeKeyless` from `src/server/aiService.ts`:
1. Official YouTube Data API v3 when ``YOUTUBE_API_KEY`` is configured.
2. Keyless live search of YouTube's public results page (``ytInitialData``).

Returns an honest empty list when neither source is reachable — no
fabricated videos, no placeholder links, ever.
"""

from __future__ import annotations

import json
import os
import re
import warnings
from typing import Any
from urllib.parse import quote

import httpx

_KEYLESS_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _encode_uri_component(value: str) -> str:
    """JS ``encodeURIComponent`` (same unreserved set, UTF-8 percent-encoding)."""
    return quote(value, safe="!~*'()")


def _dig(node: Any, *path: str | int) -> Any:
    """Follow an optional-chaining path (``a?.b?.[0]?.c``) without raising."""
    current = node
    for key in path:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list) and isinstance(key, int):
            if -len(current) <= key < len(current):
                current = current[key]
            else:
                return None
        else:
            return None
    return current


def _js_falsy(value: Any) -> bool:
    """JS truthiness: empty objects/arrays stay truthy, unlike Python."""
    if value is None or value is False:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return value == 0 or value != value  # 0 / NaN
    if isinstance(value, str):
        return value == ""
    return False


def _join_runs(runs: Any) -> str:
    """JS ``runs?.map((r) => r.text).join('')`` (null/undefined parts join as '')."""
    if not isinstance(runs, list):
        return ""
    parts: list[str] = []
    for run in runs:
        text = _dig(run, "text") if isinstance(run, dict) else None
        parts.append("" if text is None else str(text))
    return "".join(parts)


async def search_youtube_videos(query: str, max_results: int = 6) -> dict:
    """Search YouTube for ``query`` and return query/videos/totalResults/searchEngine/aiSummary."""
    trimmed_query = query.strip()
    if not trimmed_query:
        return {
            "query": query,
            "videos": [],
            "totalResults": 0,
            "searchEngine": "none",
            "aiSummary": "Enter a topic to search live YouTube results.",
        }

    # 1. Official YouTube Data API v3 (when an API key is configured).
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    if youtube_api_key:
        try:
            url = (
                "https://www.googleapis.com/youtube/v3/search"
                f"?part=snippet&type=video&maxResults={max_results}"
                f"&q={_encode_uri_component(trimmed_query + ' tutorial')}"
                f"&key={youtube_api_key}"
            )
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
            if resp.is_success:
                data = resp.json()
                items = data.get("items") if isinstance(data, dict) else None
                items = items if isinstance(items, list) else []
                if items:
                    mapped: list[dict[str, Any]] = []
                    for item in items:
                        snippet = _dig(item, "snippet")
                        snippet = snippet if isinstance(snippet, dict) else {}
                        raw_id = item.get("id") if isinstance(item, dict) else None
                        video_id = (
                            raw_id.get("videoId") if isinstance(raw_id, dict) else None
                        )
                        if not video_id:
                            video_id = raw_id
                        thumbnail_url = (
                            _dig(snippet, "thumbnails", "high", "url")
                            or _dig(snippet, "thumbnails", "medium", "url")
                            or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
                        )
                        mapped.append(
                            {
                                "id": video_id,
                                "title": decode_html_entities(
                                    snippet.get("title") or "YouTube video"
                                ),
                                "description": decode_html_entities(
                                    snippet.get("description") or ""
                                ),
                                "channelTitle": snippet.get("channelTitle") or "YouTube",
                                "publishedAt": snippet.get("publishedAt") or "",
                                "thumbnailUrl": thumbnail_url,
                                "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
                                "embedUrl": (
                                    f"https://www.youtube-nocookie.com/embed/{video_id}"
                                ),
                                "tags": [],
                            }
                        )
                    return {
                        "query": query,
                        "videos": mapped,
                        "totalResults": len(mapped),
                        "searchEngine": "youtube_api",
                        "aiSummary": (
                            f"Retrieved {len(mapped)} live results from the YouTube "
                            f'Data API for "{query}".'
                        ),
                    }
        except Exception as error:  # noqa: BLE001 — fall back to keyless search
            warnings.warn(
                f"YouTube Data API call failed; trying the keyless live search: {error}",
                stacklevel=2,
            )

    # 2. Keyless live search — parse YouTube's public results page.
    try:
        videos = await search_youtube_keyless(trimmed_query, max_results)
        if videos:
            return {
                "query": query,
                "videos": videos,
                "totalResults": len(videos),
                "searchEngine": "youtube_keyless",
                "aiSummary": (
                    f"Found {len(videos)} live YouTube results for \"{query}\" "
                    "(real-time search, no API key)."
                ),
            }
    except Exception as error:  # noqa: BLE001 — honest empty result below
        warnings.warn(f"Keyless YouTube search failed: {error}", stacklevel=2)

    # Honest empty result — nothing was found, nothing is invented.
    return {
        "query": query,
        "videos": [],
        "totalResults": 0,
        "searchEngine": "none",
        "aiSummary": (
            f'No live YouTube results could be retrieved for "{query}" right now. '
            "Please try again in a moment."
        ),
    }


def decode_html_entities(text: str) -> str:
    """Decode the small entity set YouTube titles/descriptions use (same order as TS)."""
    result = str(text).replace("&quot;", '"')
    result = re.sub(r"&#0?39;|&#x27;", "'", result)
    result = result.replace("&amp;", "&")
    result = result.replace("&lt;", "<")
    result = result.replace("&gt;", ">")
    return result.replace("&nbsp;", " ")


async def search_youtube_keyless(query: str, max_results: int) -> list[dict]:
    """Keyless REAL YouTube search: fetch the public results page and parse `ytInitialData`.

    If the page shape ever changes this returns ``[]`` rather than made-up
    videos.
    """
    url = f"https://www.youtube.com/results?search_query={_encode_uri_component(query)}"
    headers = {
        "User-Agent": _KEYLESS_UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    }
    async with httpx.AsyncClient(timeout=12.0, headers=headers) as client:
        response = await client.get(url)
    if not response.is_success:
        return []

    data = extract_yt_initial_data(response.text)
    if data is None:
        return []
    return parse_youtube_initial_data(data, max_results)


def extract_yt_initial_data(html: str) -> dict | None:
    """Find ``var ytInitialData = `` and walk the balanced JSON, respecting strings."""
    marker = "var ytInitialData = "
    start = html.find(marker)
    if start == -1:
        return None
    json_start = start + len(marker)

    # Walk the balanced JSON object, respecting string literals.
    depth = 0
    end = -1
    in_string = False
    escaped = False
    i = json_start
    while i < len(html):
        ch = html[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    if end == -1:
        return None

    try:
        data = json.loads(html[json_start:end])
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def parse_youtube_initial_data(data: dict, max_results: int) -> list[dict]:
    """Tree-walk `ytInitialData` collecting videoRenderer entries (pure function)."""
    results: list[dict[str, Any]] = []

    def visit(node: Any) -> None:
        if _js_falsy(node) or len(results) >= max_results * 3:
            return
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict):
            return

        if not _js_falsy(node.get("videoRenderer")):
            vr = node.get("videoRenderer")
            vr = vr if isinstance(vr, dict) else {}
            video_id = vr.get("videoId")
            title = (
                _dig(vr, "title", "runs", 0, "text")
                or _dig(vr, "title", "simpleText")
                or ""
            )
            if video_id and title:
                description = _join_runs(
                    _dig(vr, "descriptionSnippet", "runs")
                ) or _join_runs(
                    _dig(vr, "detailedMetadataSnippets", 0, "snippetText", "runs")
                )
                results.append(
                    {
                        "id": video_id,
                        "title": decode_html_entities(title),
                        "description": decode_html_entities(description),
                        "channelTitle": decode_html_entities(
                            _dig(vr, "ownerText", "runs", 0, "text")
                            or _dig(vr, "longBylineText", "runs", 0, "text")
                            or "YouTube"
                        ),
                        "publishedAt": _dig(vr, "publishedTimeText", "simpleText")
                        or "",
                        "thumbnailUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                        "videoUrl": f"https://www.youtube.com/watch?v={video_id}",
                        "embedUrl": f"https://www.youtube-nocookie.com/embed/{video_id}",
                        "duration": _dig(vr, "lengthText", "simpleText") or "",
                        "views": _dig(vr, "viewCountText", "simpleText") or "",
                    }
                )
            return

        for value in node.values():
            visit(value)

    visit(data)

    seen: set[Any] = set()
    unique: list[dict[str, Any]] = []
    for video in results:
        video_id = video["id"]
        if video_id in seen:
            continue
        seen.add(video_id)
        unique.append(video)
    return unique[:max_results]
