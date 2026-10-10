"""Local Ollama provider (`AI_PROVIDER=ollama`) — full and streaming chats."""

from __future__ import annotations

import json

import httpx

from ..config import get_settings

# How long a single non-streaming exchange may take.
FULL_TIMEOUT = 30.0
STREAM_TIMEOUT = 60.0


def _enabled() -> bool:
    return get_settings().ollama_enabled


def _endpoint() -> str | None:
    settings = get_settings()
    if not settings.ollama_base_url:
        return None
    return settings.ollama_base_url.rstrip("/") + "/api/chat"


def _messages(instruction: str, prompt: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": instruction},
        {"role": "user", "content": prompt},
    ]


async def query_ollama(instruction: str, prompt: str) -> str | None:
    """One non-streaming chat. Returns None when Ollama is off/unreachable."""
    if not _enabled():
        return None
    endpoint = _endpoint()
    if endpoint is None:
        return None

    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=FULL_TIMEOUT) as client:
            response = await client.post(
                endpoint,
                json={
                    "model": settings.ollama_model,
                    "stream": False,
                    "messages": _messages(instruction, prompt),
                },
            )
            if response.is_error:
                return None
            data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        import warnings

        warnings.warn(
            f"Ollama unavailable; using the local deterministic fallback. {error}",
            stacklevel=2,
        )
        return None

    message = (data or {}).get("message") or {}
    content = (message.get("content") or "").strip()
    return content or None


async def query_ollama_stream(instruction: str, prompt: str, emit) -> str | None:
    """Streaming chat: `emit(chunk)` receives each delta as it arrives."""
    if not _enabled():
        return None
    endpoint = _endpoint()
    if endpoint is None:
        return None

    settings = get_settings()
    full: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=STREAM_TIMEOUT) as client:
            async with client.stream(
                "POST",
                endpoint,
                json={
                    "model": settings.ollama_model,
                    "stream": True,
                    "messages": _messages(instruction, prompt),
                },
                headers={"Accept": "text/event-stream"},
            ) as response:
                if response.is_error:
                    return None
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        frame = json.loads(line)
                    except (json.JSONDecodeError, ValueError):
                        continue  # incomplete NDJSON frame
                    delta = ((frame.get("message") or {}).get("content")) or ""
                    if delta:
                        full.append(delta)
                        emit(delta)
    except (httpx.HTTPError, ValueError) as error:
        import warnings

        warnings.warn(
            f"Ollama stream unavailable; using a full response instead. {error}",
            stacklevel=2,
        )
        return None

    text = "".join(full).strip()
    return text or None
