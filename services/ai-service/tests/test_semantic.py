"""Semantic search: indexing, scoring and Arabic/English intent boosts."""

from __future__ import annotations

import asyncio

from app.semantic import perform_semantic_search


def _corpus() -> dict:
    return {
        "docs": [
            {
                "id": "keys",
                "title": "API Keys & Scopes",
                "description": "Create, rotate and revoke API keys with granular scopes.",
                "tags": ["keys", "scopes", "security"],
                "content": "rotate a key with POST /api-keys/:id/rotate",
            },
            {
                "id": "webhooks",
                "title": "Webhooks Guide",
                "description": "Sign and verify inbound webhook payloads.",
                "tags": ["webhooks", "hmac"],
                "content": "verify the signature header",
            },
        ],
        "keys": [
            {
                "id": "k1",
                "name": "production",
                "keyPrefix": "sk_live_",
                "ownerName": "sara",
                "environment": "production",
                "status": "active",
                "scopes": ["api.read", "keys.rotate"],
                "rateLimitPerMin": 120,
            }
        ],
        "status": [
            {"name": "API Ingress", "status": "operational", "uptime": "99.9%", "latency": "42ms"}
        ],
        "bots": [
            {"id": "b1", "name": "Ops Discord", "platform": "discord", "status": "online", "commandsExecuted": 12, "lastPingAt": "now"}
        ],
        "threats": [],
        "releases": [
            {
                "id": "r1",
                "name": "Vanitas Android",
                "version": "1.0.0",
                "platform": "android",
                "type": "apk",
                "architecture": "arm64",
                "minOsVersion": "8.0",
                "description": "Mobile client",
                "filename": "vanitas.apk",
                "features": ["keys", "status"],
            }
        ],
    }


def test_indexes_every_section_and_ranks_relevant_hits() -> None:
    result = asyncio.run(perform_semantic_search("rotate api key", _corpus()))
    assert result["totalIndexedItems"] == 6  # 2 docs + 1 key + 1 status + 1 bot + 1 release
    assert result["query"] == "rotate api key"
    assert result["hits"], "expected at least one ranked hit"
    # The API-key section is boosted for key/token queries.
    assert result["hits"][0]["category"] in {"api_keys", "documentation"}
    assert result["hits"][0]["confidenceLevel"] in {"high", "medium", "low"}
    assert 0.1 <= result["hits"][0]["relevanceScore"] <= 0.99
    assert result["executionTimeMs"] >= 0


def test_results_are_sorted_and_capped_at_eight() -> None:
    corpus = _corpus()
    corpus["docs"] = [
        {"id": i, "title": f"API key guide {i}", "description": "rotate keys", "tags": ["keys"], "content": "key"}
        for i in range(12)
    ]
    result = asyncio.run(perform_semantic_search("api key", corpus))
    scores = [hit["relevanceScore"] for hit in result["hits"]]
    assert scores == sorted(scores, reverse=True)
    assert len(result["hits"]) <= 8


def test_irrelevant_query_returns_no_hits() -> None:
    result = asyncio.run(perform_semantic_search("zzzz qqqq", _corpus()))
    assert result["hits"] == []
    assert "Searched" in result["aiExplanation"]


def test_arabic_key_query_boosts_the_keys_section() -> None:
    result = asyncio.run(perform_semantic_search("مفتاح api", _corpus()))
    categories = [hit["category"] for hit in result["hits"]]
    assert "api_keys" in categories


def test_download_query_boosts_the_downloads_section() -> None:
    result = asyncio.run(perform_semantic_search("تحميل تطبيق apk", _corpus()))
    categories = [hit["category"] for hit in result["hits"]]
    assert "downloads" in categories


def test_empty_corpus_is_handled() -> None:
    result = asyncio.run(
        perform_semantic_search(
            "keys", {"docs": [], "keys": [], "status": [], "bots": [], "threats": [], "releases": []}
        )
    )
    assert result["totalIndexedItems"] == 0
    assert result["hits"] == []
