"""HTTP surface of the analytics service (FastAPI TestClient, offline)."""

from __future__ import annotations

from app.config import reset_settings

from conftest import HOUR, NOW_MS, make_events


def _body(events=None, period="24h", **extra):
    # `nowMs` pins the analysis window to the fixed clock in conftest — the
    # endpoint otherwise uses wall-clock time and would fold past fixtures out.
    payload = {
        "events": events if events is not None else make_events(),
        "period": period,
        "nowMs": NOW_MS,
    }
    payload.update(extra)
    return payload


def test_health_reports_the_language(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "vanitas-analytics",
        "language": "python",
    }


def test_ready_declares_both_engines(client):
    payload = client.get("/ready").json()
    assert payload["r"] in {"available", "python_fallback"}
    assert payload["engines"] == ["python", "r"]
    assert payload["maxEvents"] >= 1


def test_meta_lists_the_supported_periods(client):
    payload = client.get("/v1/analytics/meta").json()
    assert payload["periods"] == ["24h", "30d", "7d"]
    assert payload["bucketUnits"] == ["hour", "day"]


def test_analyze_returns_the_full_shape(client):
    response = client.post("/v1/analytics/analyze", json=_body())
    assert response.status_code == 200
    payload = response.json()
    assert payload["engine"] == "python"
    assert payload["period"] == "24h"
    assert payload["volume"]["total"] == 24
    assert payload["latency"]["p95"] >= payload["latency"]["p50"]
    assert payload["status"]["byClass"]["2xx"] == 24
    assert len(payload["timeseries"]) == 24
    assert payload["truncated"] is False
    assert payload["received"] == 24
    assert payload["insights"]


def test_analyze_accepts_an_empty_body(client):
    payload = client.post("/v1/analytics/analyze", json={}).json()
    assert payload["volume"]["total"] == 0
    assert payload["engine"] == "python"


def test_analyze_rejects_an_unknown_period(client):
    response = client.post(
        "/v1/analytics/analyze", json=_body(period="999")
    )
    assert response.status_code == 422  # pydantic Literal validation


def test_analyze_trims_instead_of_failing_when_over_the_bound(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_MAX_EVENTS", "5")
    reset_settings()
    response = client.post(
        "/v1/analytics/analyze", json=_body(events=make_events(hours=4, per_hour=40))
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["truncated"] is True
    assert payload["received"] == 160
    assert payload["volume"]["total"] == 5


def test_report_returns_markdown_and_both_csvs(client):
    payload = client.post("/v1/analytics/report", json=_body()).json()
    assert payload["markdown"].startswith("# تقرير تحليل البيانات")
    assert payload["timeseriesCsv"].startswith("bucket,requests,")
    assert payload["endpointsCsv"].startswith("path,requests,")
    assert payload["analysis"]["volume"]["total"] == 24


def test_chart_returns_svg_and_the_raw_variant_serves_image_svg(client):
    payload = client.post("/v1/analytics/chart", json=_body(chart="timeseries")).json()
    assert payload["chart"] == "timeseries"
    assert payload["svg"].startswith("<svg")

    endpoint_chart = client.post(
        "/v1/analytics/chart", json=_body(chart="endpoints")
    ).json()
    assert "<svg" in endpoint_chart["svg"]

    raw = client.post("/v1/analytics/chart.svg", json=_body(chart="timeseries"))
    assert raw.status_code == 200
    assert raw.headers["content-type"].startswith("image/svg+xml")
    assert raw.text.startswith("<svg")


def test_trend_endpoint_uses_the_python_engine_without_r(client, monkeypatch):
    from app import rbridge

    monkeypatch.setattr(rbridge, "r_available", lambda: False)
    payload = client.post("/v1/analytics/trend", json=_body()).json()
    assert payload["engine"] == "python"
    assert payload["regression"]["rSquared"] >= 0


def test_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", "s3cret")
    reset_settings()

    assert client.post("/v1/analytics/analyze", json=_body()).status_code == 401

    header_token = client.post(
        "/v1/analytics/analyze", json=_body(), headers={"X-Internal-Token": "s3cret"}
    )
    assert header_token.status_code == 200

    bearer = client.post(
        "/v1/analytics/analyze",
        json=_body(),
        headers={"Authorization": "Bearer s3cret"},
    )
    assert bearer.status_code == 200

    wrong = client.post(
        "/v1/analytics/analyze", json=_body(), headers={"X-Internal-Token": "nope"}
    )
    assert wrong.status_code == 401


def test_read_only_endpoints_stay_open(client):
    """Health/meta must not require a token — orchestrators probe them."""
    assert client.get("/health").status_code == 200
    assert client.get("/v1/analytics/meta").status_code == 200


def test_numbers_reach_the_report_end_to_end(client):
    events = make_events(hours=3, per_hour=8) + [
        {
            "ts": NOW_MS - 3 * HOUR,
            "keyId": "key-b",
            "ownerId": "user-2",
            "path": "/api/v1/ai/chat",
            "status": 500,
            "latencyMs": 900.0,
        }
    ]
    payload = client.post("/v1/analytics/report", json=_body(events=events)).json()
    analysis = payload["analysis"]
    assert analysis["volume"]["total"] == 25
    assert analysis["status"]["errors"] == 1
    assert "| 24 | " in payload["markdown"] or "| 24 |" in payload["markdown"]
    assert "`/api/v1/ai/chat`" in payload["markdown"]
