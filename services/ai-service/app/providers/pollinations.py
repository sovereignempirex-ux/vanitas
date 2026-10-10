"""Pollinations.ai — the free, keyless model behind the default fallback chain.

Ported from `src/server/aiService.ts`: model rotation, per-model circuit
breakers for their recurring ENOSPC incident, the 15s (5s with token) rate
window, a whole-request budget, and three routes (stream → full → legacy).
"""

from __future__ import annotations

import time
import warnings
from typing import Callable

import httpx

from ..config import get_settings

# Undici's default `node` UA plus datacenter egress trips bot rules on some
# free gateways; present a normal browser identity instead.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Whole-request budget: leave room for streamed attempt → window wait → retry
# → disclosed local-KB fallback.
DEFAULT_BUDGET_MS = 26_000

_stream_skip_until = 0.0
_model_sick_until: dict[str, float] = {}
last_upstream: str | None = None


def get_last_upstream() -> str | None:
    """Why the last live-provider attempt failed (`pollinations_http_500`, …)."""
    return last_upstream


def reset_state() -> None:
    """Clear circuit breakers and diagnostics (tests / manual recovery)."""
    global _stream_skip_until, last_upstream
    _stream_skip_until = 0.0
    last_upstream = None
    _model_sick_until.clear()


def _now_ms() -> float:
    return time.time() * 1000


def window_ms() -> int:
    """Anonymous = 1 request / 15s, Bearer token = 1 / 5s."""
    return 5_000 if get_settings().pollinations_token else 15_000


def budget_ms() -> int:
    return get_settings().request_budget_ms or DEFAULT_BUDGET_MS


def models() -> tuple[str, ...]:
    return get_settings().pollinations_models


def pick_model(prefer_first: bool) -> str:
    """First healthy model (best quality) or the safety net (last one)."""
    pool = models()
    healthy = [m for m in pool if _model_sick_until.get(m, 0) < _now_ms()]
    candidates = healthy or list(pool)
    return candidates[0] if prefer_first else candidates[-1]


def mark_model_sick(model: str, status: int) -> None:
    # 5xx (ENOSPC) or 404 (model gone) → stop using it for 5 minutes.
    if status >= 500 or status == 404:
        _model_sick_until[model] = _now_ms() + 300_000


def mark_model_well(model: str) -> None:
    _model_sick_until.pop(model, None)


def _set_upstream(value: str | None) -> None:
    global last_upstream
    last_upstream = value


def headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    result = {"User-Agent": BROWSER_UA, **(extra or {})}
    token = get_settings().pollinations_token
    if token:
        result["authorization"] = f"Bearer {token}"
    return result


def messages(model: str, instruction: str, prompt: str) -> list[dict[str, str]]:
    # `openai-fast` gets one combined user message (its system channel is weak).
    if model == "openai-fast":
        return [{"role": "user", "content": f"{instruction}\n\n{prompt}"}]
    return [
        {"role": "system", "content": instruction},
        {"role": "user", "content": prompt},
    ]


def _base_url() -> str:
    return get_settings().pollinations_base_url


def retry_delay(attempt: int, last_attempt_at: float, budget_until: float) -> float | None:
    """Seconds to wait before the next attempt, or None when out of budget.

    Attempt 0 gets a quick 2s lottery probe (402s sometimes clear instantly
    across their nodes); later attempts anchor on the LAST send time — their
    window reopens `window` after the most recent request, not the first.
    """
    if attempt == 0:
        wait = 2_000.0
    else:
        wait = last_attempt_at + window_ms() + 1_500 - _now_ms()
    wait = max(wait, 0.0)
    if _now_ms() + wait + 4_000 > budget_until:
        return None
    return wait / 1000.0


async def _sleep(seconds: float) -> None:
    if seconds > 0:
        import asyncio

        await asyncio.sleep(seconds)


async def query_pollinations(
    instruction: str,
    prompt: str,
    budget_until: float | None = None,
) -> str | None:
    """Full (non-streaming) answer on `/openai`, with rotation + backoff."""
    budget = budget_until if budget_until is not None else _now_ms() + budget_ms()
    for attempt in range(3):
        if budget - _now_ms() < 4_000:
            return None
        model = pick_model(prefer_first=attempt == 0)
        sent_at = _now_ms()
        try:
            async with httpx.AsyncClient(
                timeout=min(20_000, max(1_000, budget - _now_ms())) / 1000.0
            ) as client:
                response = await client.post(
                    f"{_base_url()}/openai",
                    headers=headers({"Content-Type": "application/json", "Accept": "application/json"}),
                    json={"model": model, "messages": messages(model, instruction, prompt)},
                )
            if response.is_error:
                _set_upstream(f"pollinations_http_{response.status_code}")
                mark_model_sick(model, response.status_code)
                warnings.warn(f"Pollinations HTTP {response.status_code} (attempt {attempt + 1});")
                wait = retry_delay(attempt, sent_at, budget)
                if wait is None:
                    return None
                await _sleep(wait)
                continue
            data = response.json()
            choices = data.get("choices") or []
            text = (((choices[0] or {}).get("message") or {}).get("content") or "").strip() if choices else ""
            if text:
                _set_upstream(None)
                mark_model_well(model)
                return text
            _set_upstream("pollinations_empty_reply")
            wait = retry_delay(attempt, sent_at, budget)
            if wait is None:
                return None
            await _sleep(wait)
        except (httpx.HTTPError, ValueError) as error:
            name = type(error).__name__ or "network_error"
            _set_upstream(f"pollinations_{name}")
            warnings.warn(
                f"Pollinations unavailable; using the local deterministic fallback. {error}"
            )
            return None  # network/timeout — retrying immediately rarely helps
    return None


async def query_pollinations_legacy(
    instruction: str,
    prompt: str,
    budget_until: float | None = None,
) -> str | None:
    """Legacy plain endpoint at a different route — still a real model answer."""
    budget = budget_until if budget_until is not None else _now_ms() + budget_ms()
    if budget - _now_ms() < 3_000:
        return None
    model = pick_model(prefer_first=False)
    try:
        async with httpx.AsyncClient(
            timeout=min(20_000, max(1_000, budget - _now_ms())) / 1000.0
        ) as client:
            response = await client.post(
                _base_url(),
                headers=headers({"Content-Type": "application/json"}),
                json={"model": model, "messages": messages(model, instruction, prompt)},
            )
        if response.is_error:
            _set_upstream(f"pollinations_legacy_http_{response.status_code}")
            mark_model_sick(model, response.status_code)
            warnings.warn(f"Pollinations legacy HTTP {response.status_code};")
            return None
        text = response.text.strip()
        if not text:
            _set_upstream("pollinations_legacy_empty")
            return None
        if text.startswith("{"):
            import json

            try:
                payload = json.loads(text)
            except (json.JSONDecodeError, ValueError):
                payload = None
            if isinstance(payload, dict) and payload.get("error"):
                _set_upstream(f"pollinations_legacy_error_{str(payload['error'])[:40]}")
                return None
        _set_upstream(None)
        mark_model_well(model)
        return text
    except httpx.HTTPError as error:
        _set_upstream(f"pollinations_legacy_{type(error).__name__}")
        return None


async def query_pollinations_stream(
    instruction: str,
    prompt: str,
    emit: Callable[[str], None],
    budget_until: float | None = None,
) -> str | None:
    """Streaming answer; `emit(chunk)` receives each delta as it arrives."""
    global _stream_skip_until

    budget = budget_until if budget_until is not None else _now_ms() + budget_ms()
    # Stream path recently hung → skip straight to the full query for 3 min.
    if _now_ms() < _stream_skip_until:
        return None

    for attempt in range(2):
        if budget - _now_ms() < 4_000:
            return None
        model = pick_model(prefer_first=attempt == 0)
        sent_at = _now_ms()
        # Two-phase deadline: headers within 5s, then the exchange may run
        # until 8s before the request budget so the full fallback still fits.
        header_timeout = 5.0
        total_timeout = max(1.0, (budget - _now_ms()) / 1000.0 - 8.0)
        try:
            async with httpx.AsyncClient(timeout=header_timeout) as client:
                async with client.stream(
                    "POST",
                    f"{_base_url()}/openai",
                    headers=headers(
                        {"Content-Type": "application/json", "Accept": "text/event-stream"}
                    ),
                    json={
                        "model": model,
                        "stream": True,
                        "messages": messages(model, instruction, prompt),
                    },
                ) as response:
                    if response.is_error:
                        status = response.status_code
                        mark_model_sick(model, status)
                        _set_upstream(f"pollinations_stream_http_{status}")
                        warnings.warn(f"Pollinations stream HTTP {status} (attempt {attempt + 1});")
                        if attempt + 1 < 2:
                            wait = retry_delay(attempt, sent_at, budget)
                            if wait is not None:
                                await _sleep(wait)
                                continue
                        return None

                    content_type = response.headers.get("content-type") or ""
                    if "event-stream" not in content_type:
                        # Provider ignored the stream flag → single delta reply.
                        raw = (await response.aread()).decode("utf-8", "replace").strip()
                        if not raw:
                            return None
                        text = _first_message(raw) or raw
                        _set_upstream(None)
                        mark_model_well(model)
                        emit(text)
                        return text

                    full = _consume_sse(response, emit)
                    if full.strip():
                        _set_upstream(None)
                        mark_model_well(model)
                        _stream_skip_until = 0.0
                        return full.strip()
                    _set_upstream("pollinations_stream_empty_reply")
                    return None
        except httpx.HTTPError as error:
            name = type(error).__name__
            _set_upstream(f"pollinations_stream_{name}")
            if name in {"ReadTimeout", "WriteTimeout", "ConnectTimeout", "TimeoutException"}:
                # Started but stalled mid-stream — same signal as a hang.
                _stream_skip_until = _now_ms() + 180_000
                warnings.warn("Pollinations stream stalled; skipping streams for 3 minutes.")
            else:
                warnings.warn(
                    f"Pollinations stream aborted; using a full response instead. {error}"
                )
            return None
    return None


def _first_message(raw: str) -> str | None:
    """Pull `choices[0].message.content` out of a one-shot JSON body."""
    import json

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    choices = payload.get("choices") or []
    if not choices:
        return None
    content = ((choices[0] or {}).get("message") or {}).get("content")
    return content or None


def _consume_sse(response: httpx.Response, emit: Callable[[str], None]) -> str:
    """Read an SSE body, emitting `choices[].delta.content` chunks."""
    import json

    full = ""
    for line in response.iter_lines():
        trimmed = line.strip()
        if not trimmed.startswith("data:"):
            continue
        payload = trimmed[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            frame = json.loads(payload)
        except (json.JSONDecodeError, ValueError):
            continue  # partial or unknown frame — skip it
        choices = frame.get("choices") or []
        if not choices:
            continue
        delta = ((choices[0] or {}).get("delta") or {}).get("content")
        if delta:
            full += delta
            emit(delta)
    return full
