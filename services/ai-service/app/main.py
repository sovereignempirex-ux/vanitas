"""Vanitas AI microservice (Python) — FastAPI entry point.

This service owns the AI/ML domain of the platform, which the language map
assigns to Python: chat completion, streaming chat, code diagnosis, semantic
search and live video lookup. The TypeScript gateway calls it over HTTP when
`AI_SERVICE_URL` is set and keeps its own chain as a fallback.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .chain import process_ai_query, process_ai_query_stream
from .config import get_settings
from .diagnosis.service import diagnose_and_fix
from .providers import gemini, ollama, pollinations
from .prompts import BASE_INSTRUCTIONS, TONE_MODIFIERS
from .semantic import perform_semantic_search
from .youtube import search_youtube_videos

Persona = Literal["code", "api", "security", "analyst", "docs", "video", "admin"]
Tone = Literal["architect", "security", "developer", "bot", "arabic"]


class ChatRequest(BaseModel):
    persona: Persona = "code"
    toneStyle: Tone = "developer"
    prompt: str = Field(min_length=1, max_length=200_000)
    context: dict[str, Any] | None = None
    enableWebSearch: bool = False
    enableVideoSearch: bool = False


class DiagnoseRequest(BaseModel):
    code: str = ""
    language: str = "typescript"
    context: str | None = None
    analysisMode: str = "full"
    autoFix: bool = False


class SemanticRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2_000)
    corpus: dict[str, Any] = Field(default_factory=dict)


def _options(body: ChatRequest) -> dict[str, Any]:
    return {
        "persona": body.persona,
        "toneStyle": body.toneStyle,
        "prompt": body.prompt,
        "context": body.context,
        "enableWebSearch": body.enableWebSearch,
        "enableVideoSearch": body.enableVideoSearch,
    }


async def require_token(
    authorization: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """Reject unauthenticated callers when AI_SERVICE_TOKEN is configured."""
    expected = get_settings().service_token
    if not expected:
        return
    supplied = x_internal_token or ""
    if not supplied and authorization:
        scheme, _, value = authorization.partition(" ")
        supplied = value if scheme.lower() == "bearer" else authorization
    if supplied != expected:
        raise HTTPException(status_code=401, detail="invalid ai service token")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Vanitas AI Service",
        version="1.0.0",
        description="AI/ML domain of the Vanitas platform, in Python.",
        docs_url="/docs" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"status": "ok", "service": "vanitas-ai", "language": "python"}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        snapshot = get_settings()
        return {
            "providers": {
                "gemini": snapshot.has_gemini and not snapshot.skip_gemini,
                "ollama": snapshot.ollama_enabled,
                "pollinations": True,
                "youtube": bool(snapshot.youtube_api_key),
            },
            "engine": "local_kb" if _no_live_provider() else "live",
            "lastUpstream": pollinations.get_last_upstream(),
        }

    @app.post("/v1/ai/chat", dependencies=[Depends(require_token)])
    async def chat(body: ChatRequest) -> dict[str, Any]:
        return await process_ai_query(_options(body))

    @app.post("/v1/ai/chat/stream", dependencies=[Depends(require_token)])
    async def chat_stream(body: ChatRequest) -> StreamingResponse:
        queue: asyncio.Queue[str | None] = asyncio.Queue()

        def emit(chunk: str) -> None:
            queue.put_nowait(json.dumps({"delta": chunk}, ensure_ascii=False))

        async def runner() -> None:
            try:
                result = await process_ai_query_stream(_options(body), emit)
                await queue.put(
                    json.dumps({"done": True, "result": result}, ensure_ascii=False)
                )
            except Exception as error:  # noqa: BLE001 — surfaced to the client
                await queue.put(
                    json.dumps({"error": str(error)}, ensure_ascii=False)
                )
            finally:
                await queue.put(None)

        task = asyncio.create_task(runner())

        async def events():
            try:
                while True:
                    payload = await queue.get()
                    if payload is None:
                        break
                    yield f"data: {payload}\n\n"
            finally:
                task.cancel()

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/v1/ai/diagnose", dependencies=[Depends(require_token)])
    async def diagnose(body: DiagnoseRequest) -> dict[str, Any]:
        return await diagnose_and_fix(body.model_dump())

    @app.post("/v1/ai/semantic-search", dependencies=[Depends(require_token)])
    async def semantic_search(body: SemanticRequest) -> dict[str, Any]:
        return await perform_semantic_search(body.query, body.corpus)

    @app.get("/v1/ai/youtube", dependencies=[Depends(require_token)])
    async def youtube(
        q: str = Query(min_length=1, max_length=300),
        limit: int = Query(default=6, ge=1, le=20),
    ) -> dict[str, Any]:
        return await search_youtube_videos(q, limit)

    @app.get("/v1/ai/personas")
    async def personas() -> dict[str, Any]:
        """The persona/tone vocabulary the gateway may send."""
        return {"personas": sorted(BASE_INSTRUCTIONS), "tones": sorted(TONE_MODIFIERS)}

    @app.exception_handler(Exception)
    async def on_error(request: Request, exc: Exception) -> JSONResponse:  # pragma: no cover
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return app


def _no_live_provider() -> bool:
    settings = get_settings()
    gemini_ready = settings.has_gemini and not settings.skip_gemini
    return not (gemini_ready or settings.ollama_enabled)


app = create_app()


def main() -> None:  # pragma: no cover — console entry point
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=os.environ.get("AI_SERVICE_RELOAD") == "1",
    )


if __name__ == "__main__":  # pragma: no cover
    main()
