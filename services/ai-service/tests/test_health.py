"""Health/readiness endpoints and internal-token protection."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import reset_settings


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["language"] == "python"
    assert body["service"] == "vanitas-ai"


def test_ready_without_any_provider(client: TestClient) -> None:
    body = client.get("/ready").json()
    assert body["providers"] == {
        "gemini": False,
        "ollama": False,
        "pollinations": True,
        "youtube": False,
    }
    assert body["engine"] == "local_kb"


def test_ready_reports_ollama_when_configured(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    reset_settings()
    body = client.get("/ready").json()
    assert body["providers"]["ollama"] is True
    assert body["engine"] == "live"


def test_personas_and_tones_are_advertised(client: TestClient) -> None:
    body = client.get("/v1/ai/personas").json()
    assert body["personas"] == [
        "admin",
        "analyst",
        "api",
        "code",
        "docs",
        "security",
        "video",
    ]
    assert body["tones"] == ["arabic", "architect", "bot", "developer", "security"]


def test_internal_token_is_enforced_when_configured(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("AI_SERVICE_TOKEN", "s3cret-token")
    reset_settings()

    assert client.get("/health").status_code == 200  # liveness stays open
    denied = client.post("/v1/ai/chat", json={"prompt": "hi"})
    assert denied.status_code == 401

    allowed = client.post(
        "/v1/ai/chat",
        json={"prompt": "hi"},
        headers={"X-Internal-Token": "s3cret-token"},
    )
    assert allowed.status_code != 401  # authorized → handled by the chain

    bearer = client.post(
        "/v1/ai/chat",
        json={"prompt": "hi"},
        headers={"Authorization": "Bearer s3cret-token"},
    )
    assert bearer.status_code != 401


def test_chat_rejects_empty_prompt(client: TestClient) -> None:
    assert client.post("/v1/ai/chat", json={"prompt": ""}).status_code == 422


def test_chat_rejects_unknown_persona(client: TestClient) -> None:
    body = {"prompt": "hello", "persona": "wizard", "toneStyle": "developer"}
    assert client.post("/v1/ai/chat", json=body).status_code == 422
