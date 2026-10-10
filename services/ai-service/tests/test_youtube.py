"""YouTube search: the keyless result-page parser (no network in tests)."""

from __future__ import annotations

import json

from app.youtube import (
    decode_html_entities,
    extract_yt_initial_data,
    parse_youtube_initial_data,
    search_youtube_videos,
)


def _data() -> dict:
    return {
        "contents": {
            "twoColumnSearchResultsRenderer": {
                "primaryContents": {
                    "sectionListRenderer": {
                        "contents": [
                            {
                                "itemSectionRenderer": {
                                    "contents": [
                                        {
                                            "videoRenderer": {
                                                "videoId": "abc123",
                                                "title": {
                                                    "runs": [{"text": "Learn React &amp; TypeScript"}]
                                                },
                                                "ownerText": {"runs": [{"text": "Vanitas"}]},
                                                "publishedTimeText": {"simpleText": "2 days ago"},
                                                "lengthText": {"simpleText": "12:34"},
                                                "viewCountText": {"simpleText": "10K views"},
                                                "descriptionSnippet": {
                                                    "runs": [{"text": "A full course"}]
                                                },
                                            }
                                        },
                                        {
                                            "videoRenderer": {
                                                "videoId": "abc123",  # duplicate id
                                                "title": {"runs": [{"text": "Duplicate"}]},
                                            }
                                        },
                                        {
                                            "videoRenderer": {
                                                "videoId": "def456",
                                                "title": {"simpleText": "Second video"},
                                            }
                                        },
                                    ]
                                }
                            }
                        ]
                    }
                }
            }
        }
    }


def test_parser_extracts_deduped_videos() -> None:
    videos = parse_youtube_initial_data(_data(), 5)
    assert [video["id"] for video in videos] == ["abc123", "def456"]
    first = videos[0]
    assert first["title"] == "Learn React & TypeScript"
    assert first["channelTitle"] == "Vanitas"
    assert first["videoUrl"] == "https://www.youtube.com/watch?v=abc123"
    assert first["embedUrl"] == "https://www.youtube-nocookie.com/embed/abc123"
    assert first["thumbnailUrl"] == "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
    assert first["duration"] == "12:34"
    assert first["views"] == "10K views"


def test_parser_respects_max_results() -> None:
    assert len(parse_youtube_initial_data(_data(), 1)) == 1


def test_extract_walks_balanced_json_even_with_braces_in_strings() -> None:
    payload = json.dumps({"a": "}}} not the end", "b": {"c": 1}})
    html = f"<script>var ytInitialData = {payload};</script>"
    parsed = extract_yt_initial_data(html)
    assert parsed is not None
    assert parsed["b"] == {"c": 1}


def test_extract_returns_none_for_unrelated_pages() -> None:
    assert extract_yt_initial_data("<html><body>no data here</body></html>") is None
    assert extract_yt_initial_data('var ytInitialData = {"broken": ') is None


def test_decode_html_entities() -> None:
    assert decode_html_entities("a &amp; b &lt;c&gt; &quot;d&quot; &#039;e&#039;") == (
        'a & b <c> "d" \'e\''
    )


async def test_empty_query_is_an_honest_empty_result() -> None:
    result = await search_youtube_videos("   ")
    assert result["searchEngine"] == "none"
    assert result["videos"] == []
    assert result["totalResults"] == 0
    assert "Enter a topic" in (result["aiSummary"] or "")
