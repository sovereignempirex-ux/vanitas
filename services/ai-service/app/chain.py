"""The provider chain: prepare → Ollama → Gemini → Pollinations → local KB.

Same order, budgets and disclosure rules as `src/server/aiService.ts`.
"""

from __future__ import annotations

import time
from typing import Any, Awaitable, Callable

from .config import get_settings
from . import prompts as promptkit
from .providers import gemini, ollama, pollinations
from .prompts import PreparedPrompt

# Video intent search (real YouTube results, never invented).
from .youtube import search_youtube_videos

Emit = Callable[[str], None]


def _now_ms() -> float:
    return time.time() * 1000


def _notice(prompt: str) -> str:
    if promptkit.contains_arabic(prompt):
        return (
            "> ⚠️ المحرك السحابي مؤقتاً غير متاح الآن — هذه الإجابة من قاعدة "
            "المعرفة المحلية المدمجة في المنصة.\n\n"
        )
    return (
        "> ⚠️ The live AI engine is temporarily unreachable — this reply comes "
        "from the platform's built-in local knowledge base.\n\n"
    )


async def prepare_query(options: dict[str, Any]) -> PreparedPrompt:
    """Detect video intent, retrieve videos, and build the system instruction."""
    persona = str(options.get("persona") or "code")
    tone_style = str(options.get("toneStyle") or "developer")
    prompt = str(options.get("prompt") or "")
    context = options.get("context") if isinstance(options.get("context"), dict) else None
    enable_video = bool(options.get("enableVideoSearch"))

    video_query: str | None = None
    videos: list[dict] = []

    if promptkit.detect_video_intent(prompt, persona, enable_video):
        video_query = promptkit.clean_video_query(prompt)
        try:
            result = await search_youtube_videos(video_query, 4)
            videos = result.get("videos") or []
        except Exception as error:  # noqa: BLE001 — video search is best-effort
            import warnings

            warnings.warn(f"Semantic video search in AI query error: {error}", stacklevel=2)

    instruction = promptkit.build_system_instruction(
        persona,
        tone_style,
        context=context,
        videos=videos,
    )
    return PreparedPrompt(instruction=instruction, video_query=video_query, videos=videos)


async def run_full_query(
    options: dict[str, Any],
    prep: PreparedPrompt,
    budget_until: float | None = None,
) -> dict[str, Any]:
    """Non-streaming chain: Ollama → Gemini → Pollinations → local KB."""
    persona = str(options.get("persona") or "code")
    tone_style = str(options.get("toneStyle") or "developer")
    prompt = str(options.get("prompt") or "")
    context = options.get("context") if isinstance(options.get("context"), dict) else None
    enable_web = bool(options.get("enableWebSearch"))
    budget = budget_until if budget_until is not None else _now_ms() + get_settings().request_budget_ms

    def with_meta(result: dict[str, Any]) -> dict[str, Any]:
        result.setdefault("videos", prep.videos)
        result.setdefault("videoQuery", prep.video_query)
        return result

    ollama_text = await ollama.query_ollama(prep.instruction, prompt)
    if ollama_text:
        return with_meta({"text": ollama_text, "engine": "ollama"})

    settings = get_settings()
    if not settings.skip_gemini and settings.has_gemini:
        gemini_result = await gemini.generate_text(
            prep.instruction, prompt, enable_web_search=enable_web
        )
        if gemini_result:
            text, grounding = gemini_result
            return with_meta(
                {
                    "text": text,
                    "engine": "gemini",
                    "groundingSources": grounding or None,
                }
            )

    # Free keyless model — real answers whenever no paid provider is configured.
    free_text = await pollinations.query_pollinations(prep.instruction, prompt, budget)
    if free_text:
        return with_meta({"text": free_text, "engine": "pollinations"})

    legacy_text = await pollinations.query_pollinations_legacy(prep.instruction, prompt, budget)
    if legacy_text:
        return with_meta({"text": legacy_text, "engine": "pollinations_legacy"})

    # Last resort: deterministic local knowledge base, always disclosed as such.
    from .providers.local_kb import generate_fallback_response

    fallback = generate_fallback_response(persona, tone_style, prompt, context)
    return with_meta(
        {
            **fallback,
            "text": f"{_notice(prompt)}{fallback['text']}",
            "engine": "local_kb",
            "upstream": pollinations.get_last_upstream(),
        }
    )


async def process_ai_query(options: dict[str, Any]) -> dict[str, Any]:
    """Full (non-streaming) entry point."""
    prep = await prepare_query(options)
    return await run_full_query(options, prep)


async def process_ai_query_stream(options: dict[str, Any], emit: Emit) -> dict[str, Any]:
    """Streaming entry point: emits deltas through `emit`, always returns the
    authoritative complete answer in `text`."""
    budget = _now_ms() + get_settings().request_budget_ms
    prep = await prepare_query(options)
    emitted = False

    def emit_once(chunk: str) -> None:
        nonlocal emitted
        emitted = True
        emit(chunk)

    settings = get_settings()
    # Google web-search grounding only exists on the non-streaming Gemini path.
    needs_gemini_grounding = (
        bool(options.get("enableWebSearch"))
        and not settings.skip_gemini
        and settings.has_gemini
    )

    if not needs_gemini_grounding:
        ollama_streamed = await ollama.query_ollama_stream(
            prep.instruction, str(options.get("prompt") or ""), emit_once
        )
        if ollama_streamed is not None:
            return {
                "text": ollama_streamed,
                "engine": "ollama",
                "videos": prep.videos,
                "videoQuery": prep.video_query,
            }
        if not emitted:
            polli_streamed = await pollinations.query_pollinations_stream(
                prep.instruction, str(options.get("prompt") or ""), emit_once, budget
            )
            if polli_streamed is not None:
                return {
                    "text": polli_streamed,
                    "engine": "pollinations",
                    "videos": prep.videos,
                    "videoQuery": prep.video_query,
                }

    full = await run_full_query(options, prep, budget)
    # A partial stream already went out → don't repeat it; the caller's final
    # event carries `full["text"]`, which the client syncs to.
    if full.get("text") and not emitted:
        emit_once(full["text"])
    return full
