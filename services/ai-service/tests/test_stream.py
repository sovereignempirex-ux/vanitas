"""The SSE streaming endpoint: deltas first, one authoritative final frame."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.providers import pollinations


def _events(client: TestClient, body: dict) -> list[dict]:
    events: list[dict] = []
    with client.stream("POST", "/v1/ai/chat/stream", json=body) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        for line in response.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload:
                events.append(json.loads(payload))
    return events


@pytest.fixture()
def mocked_stream(monkeypatch: pytest.MonkeyPatch):
    async def off(*args, **kwargs):
        return None

    async def stream(instruction, prompt, emit, budget=None):
        emit("مرحبا ")
        emit("بالعالم")
        return "مرحبا بالعالم"

    async def no_videos(query, limit=6):
        return {"query": query, "videos": [], "totalResults": 0, "searchEngine": "none"}

    monkeypatch.setattr("app.providers.ollama.query_ollama", off)
    monkeypatch.setattr("app.providers.pollinations.query_pollinations", off)
    monkeypatch.setattr(
        "app.providers.pollinations.query_pollinations_stream", stream
    )
    monkeypatch.setattr("app.chain.search_youtube_videos", no_videos)
    return stream


def test_stream_emits_deltas_then_one_done_frame(client: TestClient, mocked_stream) -> None:
    events = _events(client, {"prompt": "قل مرحبا", "persona": "code"})

    deltas = [event["delta"] for event in events if "delta" in event]
    assert deltas == ["مرحبا ", "بالعالم"]

    final = [event for event in events if event.get("done")]
    assert len(final) == 1
    result = final[0]["result"]
    assert result["text"] == "مرحبا بالعالم"
    assert result["engine"] == "pollinations"
    # The final frame is authoritative: it carries the complete answer.
    assert result["text"] == "".join(deltas)


def test_stream_falls_back_to_a_single_full_chunk(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def off(*args, **kwargs):
        return None

    async def full(instruction, prompt, budget=None):
        return "one shot"

    async def no_videos(query, limit=6):
        return {"query": query, "videos": [], "totalResults": 0, "searchEngine": "none"}

    monkeypatch.setattr("app.providers.ollama.query_ollama", off)
    monkeypatch.setattr("app.providers.pollinations.query_pollinations", full)
    monkeypatch.setattr("app.providers.pollinations.query_pollinations_stream", off)
    monkeypatch.setattr("app.chain.search_youtube_videos", no_videos)

    events = _events(client, {"prompt": "hi"})
    deltas = [event["delta"] for event in events if "delta" in event]
    assert deltas == ["one shot"]
    assert events[-1]["done"] is True
    assert events[-1]["result"]["text"] == "one shot"


def test_stream_surfaces_provider_crash_as_an_error_event(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(*args, **kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr("app.providers.ollama.query_ollama", boom)

    events = _events(client, {"prompt": "hi"})
    assert events, "expected at least one event"
    assert "provider exploded" in events[-1].get("error", "")


def test_stream_requires_a_prompt(client: TestClient) -> None:
    response = client.post("/v1/ai/chat/stream", json={"prompt": ""})
    assert response.status_code == 422
