"""AI-powered semantic search across documentation, keys, status, bots and downloads.

Port of `performSemanticSearch` from `src/server/aiService.ts`: corpus
indexing, keyword/semantic scoring, Arabic/English intent boosts, confidence
levels, relevance filtering (>0.25), descending sort and the top-8 cap.
"""

from __future__ import annotations

import re
import time
import warnings
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

_DEFAULT_INTENT = "Semantic query across platform resources"

# Exact prompt sent to the model; `{query}` is substituted with `str.replace`
# so the literal JSON braces in the schema stay untouched.
_INTENT_PROMPT = """You are the Vanitas Semantic Search Engine.
Given the user's natural language search query: "{query}"
And this summary of platform sections:
- Documentation (/docs): Guides, API specifications, scopes, error handling, rate limiting.
- API Keys (/keys): Authorized keys, token rotation, secret hashing, rate limit presets, bursts.
- Public Status (/status): Health of API Ingress, Auth Gateway, PostgreSQL Cluster, WebSocket, Redis.
- Bot Gateway (/bot-gateway): Discord & WhatsApp bot dispatch, Webhook ingestion, slash commands.
- Security Center (/security): 2FA, session devices, brute-force threat mitigation, RBAC.
- Downloads (/downloads): Android APK, Windows EXE (x64/ARM64), macOS DMG, Linux AppImage.
- Database & External Servers: Supabase, Neon PostgreSQL, Upstash Redis, Render, Railway.

Respond in valid JSON only with this structure:
{
  "intent": "Brief description of user intent in 1 sentence (supports Arabic or English based on query)",
  "aiExplanation": "Helpful AI answer explaining where to find this and the direct resolution in 1-2 concise sentences",
  "relevantCategories": ["documentation", "api_keys", "status", "bot_gateway", "security", "downloads", "database"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}"""


def _js_str(value: Any) -> str:
    """Stringify like a JS template literal (``${value}``)."""
    if value is None:
        return "undefined"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, list):
        return ",".join("" if item is None else _js_str(item) for item in value)
    return str(value)


def _join(values: Any, separator: str) -> str:
    """JS ``values?.join(separator)``: undefined stays undefined, null elements join as ''."""
    if not isinstance(values, list):
        return "undefined"
    return separator.join("" if item is None else _js_str(item) for item in values)


def _slice(value: Any, size: int) -> str:
    """JS ``value?.substring(0, size)`` for string values."""
    if isinstance(value, str):
        return value[:size]
    return ""


def _round2(value: float) -> float:
    """JS ``Number(value.toFixed(2))`` — half-up at two decimals."""
    return float(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


async def perform_semantic_search(query: str, corpus: dict) -> dict:
    """Rank platform resources against a natural-language query.

    ``corpus`` may carry the optional keys ``docs``, ``keys``, ``status``,
    ``bots``, ``threats`` and ``releases``. Like the TS original, ``threats``
    is accepted but never indexed. Returns ``query``, ``intent``,
    ``aiExplanation``, ``hits``, ``totalIndexedItems`` and
    ``executionTimeMs``.
    """
    start_time = time.perf_counter()

    # 1. Flatten corpus into searchable items
    indexed_items: list[dict[str, Any]] = []

    # Index Documentation
    if isinstance(corpus.get("docs"), list):
        for doc in corpus["docs"]:
            if not isinstance(doc, dict):
                continue
            tags = doc.get("tags")
            indexed_items.append(
                {
                    "id": f"doc_{_js_str(doc.get('id') or doc.get('title'))}",
                    "title": doc.get("title") or "Documentation Guide",
                    "category": "documentation",
                    "snippet": doc.get("description")
                    or _slice(doc.get("content"), 160)
                    or "",
                    "targetView": "docs",
                    "actionLabel": "Open in Developer Portal",
                    "tags": tags
                    if isinstance(tags, list)
                    else ["api", "sdk", "endpoints"],
                    "rawText": (
                        f"{_js_str(doc.get('title'))} {_js_str(doc.get('description'))} "
                        f"{_join(tags, ' ')} {_js_str(doc.get('content') or '')}"
                    ).lower(),
                }
            )

    # Index API Keys
    if isinstance(corpus.get("keys"), list):
        for key in corpus["keys"]:
            if not isinstance(key, dict):
                continue
            scopes = key.get("scopes")
            scope_list = scopes if isinstance(scopes, list) else []
            environment = key.get("environment")
            status = key.get("status")
            indexed_items.append(
                {
                    "id": f"key_{_js_str(key.get('id'))}",
                    "title": (
                        f"API Key: {_js_str(key.get('name'))} "
                        f"({_js_str(key.get('keyPrefix'))}...)"
                    ),
                    "category": "api_keys",
                    "snippet": (
                        f"Owner: {_js_str(key.get('ownerName'))} | "
                        f"Env: {_js_str(environment).upper()} | "
                        f"Status: {_js_str(status)} | "
                        f"Scopes: [{', '.join(_js_str(s) for s in scope_list)}] | "
                        f"Rate Limit: {key.get('rateLimitPerMin') or 120} RPM"
                    ),
                    "targetView": "keys",
                    "actionLabel": "Manage Key & Scopes",
                    "tags": [
                        environment,
                        status,
                        *scope_list,
                        "credentials",
                        "rate-limit",
                    ],
                    "rawText": (
                        f"{_js_str(key.get('name'))} {_js_str(key.get('ownerName'))} "
                        f"{_js_str(environment)} {_js_str(status)} "
                        f"{_join(scope_list, ' ')} {_js_str(key.get('keyPrefix'))}"
                    ).lower(),
                }
            )

    # Index System Status & Services
    if isinstance(corpus.get("status"), list):
        for entry in corpus["status"]:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name")
            status = entry.get("status")
            indexed_items.append(
                {
                    "id": f"status_{_js_str(name)}",
                    "title": f"Service Status: {_js_str(name)}",
                    "category": "status",
                    "snippet": (
                        f"Uptime: {_js_str(entry.get('uptime'))} | "
                        f"Latency: {_js_str(entry.get('latency'))} | "
                        f"Current Status: {_js_str(status).upper()}"
                    ),
                    "targetView": "status",
                    "actionLabel": "View Live Metrics",
                    "tags": [
                        "uptime",
                        "latency",
                        "health",
                        _js_str(status),
                        _js_str(name).lower(),
                    ],
                    "rawText": (
                        f"{_js_str(name)} {_js_str(status)} "
                        f"{_js_str(entry.get('uptime'))} {_js_str(entry.get('latency'))} "
                        "status health service"
                    ).lower(),
                }
            )

    # Index Bot Gateway
    if isinstance(corpus.get("bots"), list):
        for bot in corpus["bots"]:
            if not isinstance(bot, dict):
                continue
            platform = bot.get("platform")
            status = bot.get("status")
            indexed_items.append(
                {
                    "id": f"bot_{_js_str(bot.get('id'))}",
                    "title": f"Bot: {_js_str(bot.get('name'))} ({_js_str(platform).upper()})",
                    "category": "bot_gateway",
                    "snippet": (
                        f"Status: {_js_str(status)} | "
                        f"Commands executed: {_js_str(bot.get('commandsExecuted'))} | "
                        f"Last ping: {_js_str(bot.get('lastPingAt'))}"
                    ),
                    "targetView": "bot-gateway",
                    "actionLabel": "Open Bot Gateway",
                    "tags": ["bot", platform, status],
                    "rawText": (
                        f"{_js_str(bot.get('name'))} {_js_str(platform)} "
                        f"{_js_str(status)} {_js_str(bot.get('apiKeyId') or '')}"
                    ).lower(),
                }
            )

    # Index Downloads & Modern Clients
    if isinstance(corpus.get("releases"), list):
        for release in corpus["releases"]:
            if not isinstance(release, dict):
                continue
            platform = release.get("platform")
            release_type = release.get("type")
            architecture = release.get("architecture")
            indexed_items.append(
                {
                    "id": f"rel_{_js_str(release.get('id'))}",
                    "title": (
                        f"Download Client: {_js_str(release.get('name'))} "
                        f"(v{_js_str(release.get('version'))})"
                    ),
                    "category": "downloads",
                    "snippet": (
                        f"{_js_str(platform).upper()} {_js_str(release_type).upper()} | "
                        f"Arch: {_js_str(architecture)} | "
                        f"Min OS: {_js_str(release.get('minOsVersion'))} | "
                        f"{_js_str(release.get('description'))}"
                    ),
                    "targetView": "downloads",
                    "actionLabel": f"Download {_js_str(release.get('filename'))}",
                    "tags": [
                        "download",
                        platform,
                        release_type,
                        architecture,
                        "install",
                        "apk",
                        "exe",
                    ],
                    "rawText": (
                        f"{_js_str(release.get('name'))} {_js_str(platform)} "
                        f"{_js_str(release_type)} {_js_str(architecture)} "
                        f"{_js_str(release.get('description'))} "
                        f"{_join(release.get('features'), ' ')}"
                    ).lower(),
                }
            )

    q = query.lower().strip()

    # Try Gemini AI semantic understanding
    ai_explanation = ""
    parsed_intent = _DEFAULT_INTENT

    if len(query) > 2:
        try:
            from app.providers.gemini import generate_json

            prompt_text = _INTENT_PROMPT.replace("{query}", query)
            parsed = await generate_json(prompt_text, temperature=0.2)
            if isinstance(parsed, dict):
                if parsed.get("intent"):
                    parsed_intent = parsed["intent"]
                if parsed.get("aiExplanation"):
                    ai_explanation = parsed["aiExplanation"]
        except Exception as error:  # noqa: BLE001 — degrade to local scoring
            warnings.warn(
                f"Gemini semantic search parser fallback: {error}", stacklevel=2
            )

    # Calculate semantic & keyword relevance scores
    query_tokens = [token for token in re.split(r"\s+", q) if token]

    scored_hits: list[dict[str, Any]] = []
    for item in indexed_items:
        score = 0.0
        title_lower = str(item["title"]).lower()
        snippet_lower = str(item["snippet"]).lower()
        raw = item["rawText"]

        # Exact phrase match
        if q in title_lower:
            score += 0.6
        elif q in snippet_lower:
            score += 0.4
        elif q in raw:
            score += 0.3

        # Token overlap
        for token in query_tokens:
            if token in title_lower:
                score += 0.2
            if token in snippet_lower:
                score += 0.1
            if any(token in str(tag).lower() for tag in item["tags"] if tag is not None):
                score += 0.15

        # Semantic Intent Boosts
        if (
            "key" in q
            or "token" in q
            or "مفتاح" in q
            or "رمز" in q
        ):
            if item["category"] == "api_keys":
                score += 0.3
        if (
            "download" in q
            or "apk" in q
            or "exe" in q
            or "تنزيل" in q
            or "تحميل" in q
            or "تطبيق" in q
        ):
            if item["category"] == "downloads":
                score += 0.35
        if (
            "down" in q
            or "uptime" in q
            or "error" in q
            or "latency" in q
            or "status" in q
            or "حالة" in q
            or "سيرفر" in q
        ):
            if item["category"] == "status":
                score += 0.3
        if "bot" in q or "discord" in q or "whatsapp" in q or "بوت" in q:
            if item["category"] == "bot_gateway":
                score += 0.35
        if (
            "doc" in q
            or "guide" in q
            or "code" in q
            or "endpoint" in q
            or "شرح" in q
            or "دليل" in q
        ):
            if item["category"] == "documentation":
                score += 0.3

        clamped_score = min(0.99, max(0.1, _round2(score)))
        if clamped_score >= 0.6:
            confidence_level = "high"
        elif clamped_score >= 0.35:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        scored_hits.append(
            {
                **item,
                "relevanceScore": clamped_score,
                "confidenceLevel": confidence_level,
            }
        )

    hits = sorted(
        (hit for hit in scored_hits if hit["relevanceScore"] > 0.25),
        key=lambda hit: -hit["relevanceScore"],
    )[:8]

    return {
        "query": query,
        "intent": parsed_intent,
        "aiExplanation": ai_explanation
        or (
            f"Searched {len(indexed_items)} indexed resources across "
            "Vanitas API Gateway."
        ),
        "hits": hits,
        "totalIndexedItems": len(indexed_items),
        "executionTimeMs": int((time.perf_counter() - start_time) * 1000),
    }
