"""Vanitas analytics microservice (Python) — the data-analysis domain.

Consumes the platform's real `ApiKeyUsageEvent` records and returns what the
dashboard cannot compute on its own: percentile distributions, trend deltas
against the previous window, anomaly detection and report exports.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import charts, metrics, rbridge, report
from .config import get_settings

Period = Literal["24h", "7d", "30d"]


class UsageEvent(BaseModel):
    ts: int
    keyId: str = ""
    ownerId: str = ""
    path: str = "/"
    status: int = 200
    latencyMs: float = 0


class AnalyzeRequest(BaseModel):
    events: list[UsageEvent] = Field(default_factory=list)
    period: Period = "24h"
    nowMs: int | None = None


class ChartRequest(AnalyzeRequest):
    chart: Literal["timeseries", "endpoints"] = "timeseries"


def _events(body: AnalyzeRequest) -> list[dict[str, Any]]:
    limit = get_settings().max_events
    # The gateway never sends more than its own ring buffer (20k); anything
    # beyond the bound keeps the most recent records instead of failing, so a
    # spike can never turn into an error response.
    newest_first = sorted(body.events, key=lambda event: event.ts, reverse=True)[:limit]
    newest_first.reverse()
    return [event.model_dump() for event in newest_first]


def _analysis(body: AnalyzeRequest) -> dict[str, Any]:
    payload = metrics.analyze(_events(body), body.period, body.nowMs)
    payload["received"] = len(body.events)
    payload["truncated"] = len(body.events) > get_settings().max_events
    return payload


async def require_token(
    authorization: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    """Reject unauthenticated callers when ANALYTICS_SERVICE_TOKEN is set."""
    expected = get_settings().service_token
    if not expected:
        return
    supplied = x_internal_token or ""
    if not supplied and authorization:
        scheme, _, value = authorization.partition(" ")
        supplied = value if scheme.lower() == "bearer" else authorization
    if supplied != expected:
        raise HTTPException(status_code=401, detail="invalid analytics service token")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Vanitas Analytics Service",
        version="1.0.0",
        description="Data-analysis domain of the Vanitas platform, in Python (+ optional R).",
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
        return {"status": "ok", "service": "vanitas-analytics", "language": "python"}

    @app.get("/ready")
    async def ready() -> dict[str, Any]:
        return {
            "r": "available" if rbridge.r_available() else "python_fallback",
            "maxEvents": get_settings().max_events,
            "engines": ["python", "r"],
        }

    @app.post("/v1/analytics/analyze", dependencies=[Depends(require_token)])
    async def analyze(body: AnalyzeRequest) -> dict[str, Any]:
        return _analysis(body)

    @app.post("/v1/analytics/trend", dependencies=[Depends(require_token)])
    async def trend(body: AnalyzeRequest) -> dict[str, Any]:
        return rbridge.trend_analysis(_events(body), body.period, body.nowMs)

    @app.post("/v1/analytics/report", dependencies=[Depends(require_token)])
    async def analytics_report(body: AnalyzeRequest) -> dict[str, Any]:
        """Arabic Markdown report + CSV exports of the same numbers."""
        analysis = _analysis(body)
        return {
            "markdown": report.build_markdown(analysis),
            "timeseriesCsv": report.build_timeseries_csv(analysis),
            "endpointsCsv": report.build_endpoints_csv(analysis),
            "analysis": analysis,
        }

    @app.post("/v1/analytics/chart", dependencies=[Depends(require_token)])
    async def chart(body: ChartRequest) -> dict[str, Any]:
        analysis = _analysis(body)
        if body.chart == "endpoints":
            svg = charts.ranking_bar_svg(
                analysis.get("endpoints") or [], title="أكثر المسارات استخدامًا"
            )
        else:
            svg = charts.timeseries_chart_svg(analysis)
        return {"chart": body.chart, "svg": svg}

    @app.post("/v1/analytics/chart.svg", dependencies=[Depends(require_token)])
    async def chart_svg(body: ChartRequest) -> PlainTextResponse:
        """Raw `image/svg+xml` — drop straight into an <img> or inline frame."""
        analysis = _analysis(body)
        if body.chart == "endpoints":
            svg = charts.ranking_bar_svg(
                analysis.get("endpoints") or [], title="أكثر المسارات استخدامًا"
            )
        else:
            svg = charts.timeseries_chart_svg(analysis)
        return PlainTextResponse(svg, media_type="image/svg+xml")

    @app.get("/v1/analytics/meta")
    async def meta() -> dict[str, Any]:
        """Supported periods and bucket units (self-describing API)."""
        return {"periods": sorted(metrics.PERIODS), "bucketUnits": ["hour", "day"]}

    @app.exception_handler(Exception)
    async def on_error(request, exc) -> JSONResponse:  # pragma: no cover
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return app


app = create_app()


def main() -> None:  # pragma: no cover — console entry point
    import os

    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=os.environ.get("ANALYTICS_SERVICE_RELOAD") == "1",
    )


if __name__ == "__main__":  # pragma: no cover
    main()
