"""Pollinations model rotation, circuit breakers and rate-window maths."""

from __future__ import annotations

import time

from app.config import reset_settings
from app.providers import pollinations


def test_pick_model_prefers_first_healthy() -> None:
    assert pollinations.pick_model(prefer_first=True) == "openai"
    assert pollinations.pick_model(prefer_first=False) == "openai-fast"


def test_sick_model_is_skipped_then_recovers() -> None:
    pollinations.mark_model_sick("openai", 500)
    assert pollinations.pick_model(prefer_first=True) == "openai-fast"
    # All models sick → the pool is still usable (never empty).
    pollinations.mark_model_sick("openai-fast", 500)
    assert pollinations.pick_model(prefer_first=True) in pollinations.models()

    pollinations.mark_model_well("openai")
    assert pollinations.pick_model(prefer_first=True) == "openai"


def test_healthy_statuses_do_not_trip_the_breaker() -> None:
    pollinations.mark_model_sick("openai", 429)
    assert pollinations.pick_model(prefer_first=True) == "openai"
    pollinations.mark_model_sick("openai", 404)
    assert pollinations.pick_model(prefer_first=True) == "openai-fast"


def test_rate_window_is_shorter_with_a_token(monkeypatch) -> None:
    assert pollinations.window_ms() == 15_000
    monkeypatch.setenv("POLLINATIONS_TOKEN", "tok")
    reset_settings()
    assert pollinations.window_ms() == 5_000


def test_retry_delay_probes_quickly_on_first_attempt() -> None:
    budget = time.time() * 1000 + 26_000
    assert pollinations.retry_delay(0, time.time() * 1000, budget) == 2.0


def test_retry_delay_gives_up_when_budget_is_tight() -> None:
    now = time.time() * 1000
    # Only 3s of budget left → no retry can fit (2s probe + 4s safety margin).
    assert pollinations.retry_delay(0, now, now + 3_000) is None


def test_openai_fast_gets_a_single_combined_message() -> None:
    packed = pollinations.messages("openai-fast", "SYS", "USER")
    assert packed == [{"role": "user", "content": "SYS\n\nUSER"}]
    default = pollinations.messages("openai", "SYS", "USER")
    assert default[0] == {"role": "system", "content": "SYS"}


def test_headers_include_browser_identity_and_token(monkeypatch) -> None:
    plain = pollinations.headers({"Content-Type": "application/json"})
    assert "Mozilla/5.0" in plain["User-Agent"]
    assert "authorization" not in plain

    monkeypatch.setenv("POLLINATIONS_TOKEN", "tok-123")
    reset_settings()
    assert pollinations.headers()["authorization"] == "Bearer tok-123"


def test_upstream_diagnostics_reset() -> None:
    pollinations._set_upstream("pollinations_http_500")
    assert pollinations.get_last_upstream() == "pollinations_http_500"
    pollinations.reset_state()
    assert pollinations.get_last_upstream() is None
