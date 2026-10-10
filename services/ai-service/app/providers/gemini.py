"""Google Gemini over the Generative Language REST API.

Kept dependency-free on purpose (plain `httpx`) so the service installs and
runs on any Python the host already has — no native wheels required.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ..config import get_settings

CANDIDATE_MODELS = (
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
)

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Error fragments the TS client treats as transient (worth one more candidate).
_TRANSIENT = ("503", "high demand", "RESOURCE_EXHAUSTED", "429")


def available() -> bool:
    """True when a Gemini key is configured."""
    return get_settings().has_gemini


def _endpoint(model: str) -> str:
    return f"{_BASE}/{model}:generateContent"


def _headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "x-goog-api-key": settings.gemini_api_key or "",
        "Content-Type": "application/json",
    }


def _is_transient(error: Exception) -> bool:
    text = str(error)
    return any(token in text for token in _TRANSIENT)


async def _post(payload: dict[str, Any], *, temperature: float, model: str) -> dict:
    settings = get_settings()
    body = dict(payload)
    body.setdefault("generationConfig", {})["temperature"] = temperature
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(_endpoint(model), headers=_headers(), json=body)
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Gemini returned a non-object response")
    return data


def _extract_text(data: dict) -> str | None:
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text = "".join(str(part.get("text") or "") for part in parts if isinstance(part, dict))
    return text or None


def _extract_grounding(data: dict) -> list[dict[str, str]]:
    candidates = data.get("candidates") or []
    if not candidates:
        return []
    metadata = candidates[0].get("groundingMetadata") or {}
    chunks = metadata.get("groundingChunks") or []
    sources: list[dict[str, str]] = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        web = chunk.get("web") or {}
        uri = web.get("uri")
        if uri:
            sources.append({"title": web.get("title") or uri, "url": uri})
    return sources


async def generate_text(
    instruction: str,
    prompt: str,
    *,
    enable_web_search: bool = False,
) -> tuple[str, list[dict[str, str]]] | None:
    """Run the candidate-model loop. Returns (text, grounding) or None."""
    if not available():
        return None

    payload: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": instruction}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    }
    if enable_web_search:
        payload["tools"] = [{"googleSearch": {}}]

    for index, model in enumerate(CANDIDATE_MODELS):
        try:
            data = await _post(payload, temperature=0.7, model=model)
            text = _extract_text(data)
            if text:
                return text, _extract_grounding(data)
        except Exception as error:  # noqa: BLE001 — provider errors degrade
            last = index == len(CANDIDATE_MODELS) - 1
            if _is_transient(error) and not last:
                import asyncio

                await asyncio.sleep(0.3)
                continue
            return None
    return None


async def generate_json(prompt: str, *, temperature: float = 0.2) -> dict | None:
    """Ask Gemini for a JSON object. Returns None whenever it is unavailable."""
    if not available():
        return None
    try:
        data = await _post(
            {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            temperature=temperature,
            model=CANDIDATE_MODELS[0],
        )
    except Exception as error:  # noqa: BLE001
        import warnings

        warnings.warn(f"Gemini JSON call failed: {error}", stacklevel=2)
        return None

    raw = _extract_text(data)
    if not raw:
        return None
    return _parse_json(raw)


async def diagnose_json(prompt: str, *, temperature: float = 0.15) -> dict | None:
    """Structured code-diagnosis call (JSON mime type, low temperature)."""
    return await generate_json(prompt, temperature=temperature)


def _parse_json(raw: str) -> dict | None:
    """Parse a model JSON reply, tolerating stray markdown fences."""
    candidate = raw.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", candidate, re.DOTALL | re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1)
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None
