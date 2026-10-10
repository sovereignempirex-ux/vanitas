"""Provider chain order and the disclosed local-knowledge-base fallback."""

from __future__ import annotations

import pytest

from app import chain
from app.providers import pollinations


@pytest.fixture()
def no_network(monkeypatch: pytest.MonkeyPatch):
    """Every live provider answers 'unavailable' unless a test overrides one."""

    async def off(*args, **kwargs):
        return None

    async def off_stream(*args, **kwargs):
        return None

    monkeypatch.setattr("app.providers.ollama.query_ollama", off)
    monkeypatch.setattr("app.providers.ollama.query_ollama_stream", off_stream)
    monkeypatch.setattr("app.providers.gemini.generate_text", lambda_off())
    monkeypatch.setattr("app.providers.pollinations.query_pollinations", off)
    monkeypatch.setattr("app.providers.pollinations.query_pollinations_legacy", off)
    monkeypatch.setattr(
        "app.providers.pollinations.query_pollinations_stream", off_stream
    )
    monkeypatch.setattr("app.chain.search_youtube_videos", fake_youtube())
    return monkeypatch


def lambda_off():
    async def off(*args, **kwargs):
        return None

    return off


def fake_youtube():
    async def fake(query: str, limit: int = 6):
        return {"query": query, "videos": [], "totalResults": 0, "searchEngine": "none"}

    return fake


def test_ollama_wins_when_available(no_network, monkeypatch) -> None:
    async def ollama(instruction, prompt):
        return "from-ollama"

    monkeypatch.setattr("app.providers.ollama.query_ollama", ollama)
    import asyncio

    result = asyncio.run(
        chain.process_ai_query({"persona": "code", "prompt": "hi"})
    )
    assert result["engine"] == "ollama"
    assert result["text"] == "from-ollama"


def test_pollinations_answers_when_others_are_off(no_network, monkeypatch) -> None:
    async def polli(instruction, prompt, budget=None):
        return "free-model-answer"

    monkeypatch.setattr("app.providers.pollinations.query_pollinations", polli)
    import asyncio

    result = asyncio.run(chain.process_ai_query({"persona": "api", "prompt": "hi"}))
    assert result["engine"] == "pollinations"
    assert result["text"] == "free-model-answer"


def test_local_kb_is_disclosed_when_every_provider_fails(no_network) -> None:
    import asyncio

    result = asyncio.run(chain.process_ai_query({"persona": "code", "prompt": "hello"}))
    assert result["engine"] == "local_kb"
    assert result["text"].startswith("> ⚠️ The live AI engine is temporarily unreachable")
    assert "Vanitas" in result["text"]


def test_local_kb_notice_is_arabic_for_arabic_prompts(no_network) -> None:
    import asyncio

    result = asyncio.run(
        chain.process_ai_query({"persona": "code", "prompt": "كيف أنشئ مفتاح API؟"})
    )
    assert result["engine"] == "local_kb"
    assert result["text"].startswith("> ⚠️ المحرك السحابي مؤقتاً غير متاح الآن")


def test_system_instruction_is_built_before_querying(no_network, monkeypatch) -> None:
    seen: dict[str, str] = {}

    async def ollama(instruction, prompt):
        seen["instruction"] = instruction
        return "ok"

    monkeypatch.setattr("app.providers.ollama.query_ollama", ollama)
    import asyncio

    asyncio.run(
        chain.process_ai_query(
            {"persona": "security", "toneStyle": "security", "prompt": "audit this"}
        )
    )
    assert "Vanitas Security Analyst" in seen["instruction"]
    assert "Red Team & Security Compliance Auditor" in seen["instruction"]


def test_streaming_forwards_deltas_and_returns_authoritative_text(
    no_network, monkeypatch
) -> None:
    async def polli_stream(instruction, prompt, emit, budget=None):
        emit("Hello ")
        emit("world")
        return "Hello world"

    monkeypatch.setattr(
        "app.providers.pollinations.query_pollinations_stream", polli_stream
    )
    import asyncio

    chunks: list[str] = []
    result = asyncio.run(
        chain.process_ai_query_stream({"persona": "code", "prompt": "hi"}, chunks.append)
    )
    assert chunks == ["Hello ", "world"]
    assert result["text"] == "Hello world"
    assert result["engine"] == "pollinations"


def test_stream_falls_back_to_full_text_without_repeating_partial_stream(
    no_network, monkeypatch
) -> None:
    async def nothing(*args, **kwargs):
        return None

    async def polli(instruction, prompt, budget=None):
        return "full answer"

    monkeypatch.setattr("app.providers.pollinations.query_pollinations", polli)
    import asyncio

    chunks: list[str] = []
    result = asyncio.run(
        chain.process_ai_query_stream({"persona": "code", "prompt": "hi"}, chunks.append)
    )
    assert chunks == ["full answer"]
    assert result["engine"] == "pollinations"


def test_video_intent_triggers_youtube_lookup(no_network, monkeypatch) -> None:
    calls: list[str] = []

    async def fake_yt(query: str, limit: int = 6):
        calls.append(query)
        return {
            "query": query,
            "videos": [{"id": "abc", "title": "Learn X"}],
            "totalResults": 1,
            "searchEngine": "youtube_keyless",
        }

    monkeypatch.setattr("app.chain.search_youtube_videos", fake_yt)
    import asyncio

    result = asyncio.run(
        chain.process_ai_query(
            {"persona": "code", "prompt": "show me a react tutorial", "context": None}
        )
    )
    # Same cleaning rule as the TS: filler words are stripped, not stemmed.
    assert calls and calls[0] == "a react"
    assert result["videos"] == [{"id": "abc", "title": "Learn X"}]
    assert result["videoQuery"] == "a react"
