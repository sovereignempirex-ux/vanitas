"""Shared fixtures: clean settings snapshot and an app client per test."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.config import reset_settings
from app.providers import pollinations


@pytest.fixture(autouse=True)
def clean_state(monkeypatch: pytest.MonkeyPatch):
    """Every test starts from an empty environment and fresh provider state."""
    for name in (
        "GEMINI_API_KEY",
        "AI_PROVIDER",
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
        "POLLINATIONS_TOKEN",
        "POLLINATIONS_MODEL",
        "YOUTUBE_API_KEY",
        "AI_SERVICE_TOKEN",
        "AI_SERVICE_URL",
        "AI_SERVICE_BUDGET_MS",
    ):
        monkeypatch.delenv(name, raising=False)
    reset_settings()
    pollinations.reset_state()
    yield
    reset_settings()
    pollinations.reset_state()


@pytest.fixture(autouse=True)
def offline(monkeypatch: pytest.MonkeyPatch):
    """The suite must never touch the network: every live provider is muted.

    Tests that care about a specific provider override these with their own
    implementation (monkeypatch is per-test, so the override wins).
    """

    async def unavailable(*args, **kwargs):
        return None

    async def empty_videos(query: str, limit: int = 6):
        return {
            "query": query,
            "videos": [],
            "totalResults": 0,
            "searchEngine": "none",
            "aiSummary": "offline test",
        }

    monkeypatch.setattr("app.providers.pollinations.query_pollinations", unavailable)
    monkeypatch.setattr(
        "app.providers.pollinations.query_pollinations_legacy", unavailable
    )
    monkeypatch.setattr(
        "app.providers.pollinations.query_pollinations_stream", unavailable
    )
    monkeypatch.setattr("app.providers.ollama.query_ollama", unavailable)
    monkeypatch.setattr("app.providers.ollama.query_ollama_stream", unavailable)
    monkeypatch.setattr("app.providers.gemini.generate_text", unavailable)
    monkeypatch.setattr("app.providers.gemini.generate_json", unavailable)
    monkeypatch.setattr("app.chain.search_youtube_videos", empty_videos)
    yield


@pytest.fixture()
def client() -> TestClient:
    # Imported lazily so tests that never touch the HTTP layer still run when a
    # module they do not exercise is unavailable.
    from app.main import create_app

    return TestClient(create_app())
