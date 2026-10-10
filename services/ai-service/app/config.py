"""Environment-driven configuration for the Vanitas AI microservice.

Every value is read lazily from the process environment so the service can be
imported (and unit-tested) with no variables set at all.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _split_csv(raw: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if not raw:
        return default
    parts = tuple(part.strip() for part in raw.split(",") if part.strip())
    return parts or default


def _bool(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Snapshot of the environment the AI service runs in."""

    # Providers
    gemini_api_key: str | None = None
    ai_provider: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str = "llama3.2"
    pollinations_token: str | None = None
    pollinations_models: tuple[str, ...] = ("openai", "openai-fast")
    youtube_api_key: str | None = None

    # Service hardening
    service_token: str | None = None
    host: str = "0.0.0.0"
    port: int = 8100
    log_level: str = "info"
    request_budget_ms: int = 26_000
    enable_docs: bool = True

    # Extra: allow pointing at a different base URL for Pollinations (tests).
    pollinations_base_url: str = "https://text.pollinations.ai"

    @classmethod
    def from_env(cls) -> "Settings":
        pollinations_models = _split_csv(
            os.environ.get("POLLINATIONS_MODEL"), ("openai", "openai-fast")
        )
        return cls(
            gemini_api_key=os.environ.get("GEMINI_API_KEY") or None,
            ai_provider=(os.environ.get("AI_PROVIDER") or "").strip().lower() or None,
            ollama_base_url=os.environ.get("OLLAMA_BASE_URL") or None,
            ollama_model=os.environ.get("OLLAMA_MODEL") or "llama3.2",
            pollinations_token=os.environ.get("POLLINATIONS_TOKEN") or None,
            pollinations_models=pollinations_models,
            youtube_api_key=os.environ.get("YOUTUBE_API_KEY") or None,
            service_token=os.environ.get("AI_SERVICE_TOKEN") or None,
            host=os.environ.get("AI_SERVICE_HOST") or "0.0.0.0",
            port=int(os.environ.get("AI_SERVICE_PORT") or 8100),
            log_level=(os.environ.get("AI_SERVICE_LOG_LEVEL") or "info").lower(),
            request_budget_ms=int(os.environ.get("AI_SERVICE_BUDGET_MS") or 26_000),
            enable_docs=_bool(os.environ.get("AI_SERVICE_DOCS"), True),
            pollinations_base_url=(
                os.environ.get("POLLINATIONS_BASE_URL") or "https://text.pollinations.ai"
            ).rstrip("/"),
        )

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def ollama_enabled(self) -> bool:
        return self.ai_provider == "ollama" and bool(self.ollama_base_url)

    @property
    def skip_gemini(self) -> bool:
        """The TS chain skips Gemini entirely for ollama/pollinations modes."""
        return self.ai_provider in {"ollama", "pollinations"}


_settings: Settings | None = None


def get_settings() -> Settings:
    """Return a cached settings snapshot (call `reset_settings()` in tests)."""
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def reset_settings() -> None:
    """Drop the cached snapshot so the next `get_settings()` re-reads env."""
    global _settings
    _settings = None
