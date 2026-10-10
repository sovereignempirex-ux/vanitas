"""Shared fixtures: the analytics suite is fully offline and deterministic."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.config import reset_settings
from app.main import app as fastapi_app

CLEAN_ENV = (
    "ANALYTICS_SERVICE_TOKEN",
    "ANALYTICS_MAX_EVENTS",
    "ANALYTICS_SERVICE_DOCS",
    "ANALYTICS_SERVICE_PORT",
    "RSCRIPT_PATH",
    "VANITAS_API_URL",
    "VANITAS_API_KEY",
)

# A fixed clock: 2026-10-04T23:20:00Z, so every window is reproducible.
NOW_MS = 1791156000000
HOUR = 3_600_000


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch):
    for name in CLEAN_ENV:
        monkeypatch.delenv(name, raising=False)
    reset_settings()
    yield
    reset_settings()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(fastapi_app)


def make_events(
    *,
    now_ms: int = NOW_MS,
    hours: int = 6,
    per_hour: int = 4,
    status: int = 200,
    latency_ms: float = 120.0,
    path: str = "/api/v1/public/ping",
    key_id: str = "key-a",
) -> list[dict]:
    """Synthetic usage events spread evenly over `hours` windows."""
    events: list[dict] = []
    for hour_index in range(hours):
        for seq in range(per_hour):
            events.append(
                {
                    "ts": now_ms - hour_index * HOUR - seq * 60_000,
                    "keyId": key_id,
                    "ownerId": "user-1",
                    "path": path,
                    "status": status,
                    "latencyMs": latency_ms,
                }
            )
    return events
