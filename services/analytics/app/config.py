"""Environment configuration for the Vanitas analytics microservice."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _bool(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    service_token: str | None = None
    host: str = "0.0.0.0"
    port: int = 8200
    log_level: str = "info"
    enable_docs: bool = True
    # A single analysis payload is bounded: the gateway never sends more than
    # this many usage events (the platform itself caps its ring buffer at
    # 20,000), so an oversized body is a bug, not normal traffic.
    max_events: int = 50_000
    # Optional: lets the service pull usage events from the gateway directly.
    vanitas_api_url: str | None = None
    vanitas_api_key: str | None = None
    # Optional Rscript binary; when empty the service probes PATH.
    rscript_path: str = "Rscript"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            service_token=os.environ.get("ANALYTICS_SERVICE_TOKEN") or None,
            host=os.environ.get("ANALYTICS_SERVICE_HOST") or "0.0.0.0",
            port=int(os.environ.get("ANALYTICS_SERVICE_PORT") or 8200),
            log_level=(os.environ.get("ANALYTICS_SERVICE_LOG_LEVEL") or "info").lower(),
            enable_docs=_bool(os.environ.get("ANALYTICS_SERVICE_DOCS"), True),
            max_events=int(os.environ.get("ANALYTICS_MAX_EVENTS") or 50_000),
            vanitas_api_url=os.environ.get("VANITAS_API_URL") or None,
            vanitas_api_key=os.environ.get("VANITAS_API_KEY") or None,
            rscript_path=os.environ.get("RSCRIPT_PATH") or "Rscript",
        )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None
