"""Core analysis: percentiles, windowing, status classes, trends, anomalies."""

from __future__ import annotations

from app import metrics

from conftest import HOUR, NOW_MS, make_events


def test_percentile_matches_typescript_nearest_rank():
    values = list(range(1, 101))  # 1..100
    assert metrics.percentile(values, 0.95) == 95
    assert metrics.percentile(values, 0.50) == 50
    assert metrics.percentile(values, 0.99) == 99
    # ceil(p*n)-1 clamped to the last element
    assert metrics.percentile(values, 1.0) == 100
    assert metrics.percentile([7.0], 0.95) == 7.0
    assert metrics.percentile([], 0.95) == 0.0


def test_percentile_is_order_independent():
    shuffled = [30, 10, 100, 20, 90, 40, 80, 50, 70, 60]
    assert metrics.percentile(shuffled, 0.50) == metrics.percentile(
        sorted(shuffled), 0.50
    )


def test_empty_events_produce_a_valid_empty_analysis():
    result = metrics.analyze([], "24h", NOW_MS)
    assert result["engine"] == "python"
    assert result["period"] == "24h"
    assert result["volume"]["total"] == 0
    assert result["latency"]["p95"] == 0.0
    assert result["status"]["errorRatePct"] == 0.0
    assert len(result["timeseries"]) == 24
    assert all(point["count"] == 0 for point in result["timeseries"])
    assert result["insights"] == ["لا توجد بيانات استخدام في هذه الفترة."]


def test_window_folds_by_bucket_unit():
    events = make_events(hours=8, per_hour=1)
    result = metrics.analyze(events, "24h", NOW_MS)
    assert result["bucketUnit"] == "hour"
    assert len(result["timeseries"]) == 24
    assert result["volume"]["total"] == 8

    daily = metrics.analyze(events, "7d", NOW_MS)
    assert daily["bucketUnit"] == "day"
    assert len(daily["timeseries"]) == 7


def test_previous_window_drives_the_trend():
    current = make_events(hours=4, per_hour=3)  # 12 now
    previous = [
        {**event, "ts": event["ts"] - 24 * HOUR}  # 12 in the prior window
        for event in current
    ]
    result = metrics.analyze(current + previous, "24h", NOW_MS)
    assert result["volume"]["total"] == 12
    assert result["volume"]["previous"] == 12
    assert result["volume"]["deltaPct"] == 0.0
    assert result["volume"]["trend"] == "flat"

    doubled = current + [
        {**event, "ts": event["ts"] - 24 * HOUR} for event in current * 2
    ]
    growth = metrics.analyze(doubled, "24h", NOW_MS)
    assert growth["volume"]["previous"] == 24
    assert growth["volume"]["deltaPct"] == -50.0
    assert growth["volume"]["trend"] == "down"


def test_429_is_throttling_not_an_error():
    events = make_events(hours=2, per_hour=5, status=429)
    result = metrics.analyze(events, "24h", NOW_MS)
    assert result["status"]["throttled"] == 10
    assert result["status"]["errors"] == 0
    assert result["status"]["errorRatePct"] == 0.0
    assert result["status"]["byClass"]["4xx"] == 10  # still counted by class


def test_status_classes_and_failing_paths():
    events = (
        make_events(hours=2, per_hour=4, status=200, path="/api/v1/public/ping")
        + make_events(hours=2, per_hour=3, status=500, path="/api/v1/ai/chat")
        + make_events(hours=2, per_hour=2, status=404, path="/api/v1/missing")
    )
    result = metrics.analyze(events, "24h", NOW_MS)
    assert result["status"]["byClass"]["2xx"] == 8
    assert result["status"]["byClass"]["5xx"] == 6
    assert result["status"]["byClass"]["4xx"] == 4
    assert result["status"]["errors"] == 10

    failing = result["status"]["topFailingPaths"]
    assert failing, "500s must surface"
    # Highest error rate first: /api/v1/ai/chat is 100% failing.
    assert failing[0]["path"] == "/api/v1/ai/chat"
    assert failing[0]["errorRatePct"] == 100.0

    endpoints = {item["path"]: item for item in result["endpoints"]}
    assert endpoints["/api/v1/public/ping"]["errorRatePct"] == 0.0
    # Per-item rounding can leave 99.9/100.1 — the whole must still be 100%.
    assert round(sum(item["sharePct"] for item in result["endpoints"])) == 100


def test_latency_percentiles_and_slo():
    events = [
        {
            "ts": NOW_MS - index * 60_000,
            "keyId": "k",
            "ownerId": "u",
            "path": "/x",
            "status": 200,
            "latencyMs": float(index + 1),  # 1..24 ms
        }
        for index in range(24)
    ]
    result = metrics.analyze(events, "24h", NOW_MS)
    latency = result["latency"]
    assert latency["max"] == 24.0
    assert latency["p50"] > 0
    assert latency["p95"] >= latency["p50"]
    assert latency["p99"] >= latency["p95"]
    assert result["slo"]["under100msPct"] == 100.0
    assert result["slo"]["under1sPct"] == 100.0


def test_volume_spike_is_flagged_as_an_anomaly():
    events = [{"ts": NOW_MS - (index % 23) * HOUR, "keyId": "k", "ownerId": "u",
               "path": "/x", "status": 200, "latencyMs": 50.0}
              for index in range(23)]
    events += [{"ts": NOW_MS, "keyId": "k", "ownerId": "u", "path": "/x",
                "status": 200, "latencyMs": 50.0} for _ in range(60)]
    result = metrics.analyze(events, "24h", NOW_MS)
    kinds = {anomaly["kind"] for anomaly in result["anomalies"]}
    assert "volume_spike" in kinds
    spike = next(a for a in result["anomalies"] if a["kind"] == "volume_spike")
    assert abs(spike["zscore"]) >= 2.5
    assert any("شذوذ" in line for line in result["insights"])


def test_latency_spike_is_flagged():
    events = [{"ts": NOW_MS - index * HOUR, "keyId": "k", "ownerId": "u",
               "path": "/x", "status": 200, "latencyMs": 40.0} for index in range(8)]
    events += [{"ts": NOW_MS - 8 * HOUR, "keyId": "k", "ownerId": "u",
                "path": "/x", "status": 200, "latencyMs": 40.0}]
    events += [{"ts": NOW_MS, "keyId": "k", "ownerId": "u", "path": "/x",
                "status": 200, "latencyMs": 4000.0} for _ in range(4)]
    result = metrics.analyze(events, "24h", NOW_MS)
    assert any(a["kind"] == "latency_spike" for a in result["anomalies"])


def test_malformed_events_are_skipped_not_fatal():
    events = [
        None,  # type: ignore[list-item]
        "nonsense",  # type: ignore[list-item]
        {"noTs": True},
        {"ts": "not-a-number"},
        {"ts": NOW_MS, "keyId": "k", "ownerId": "u", "path": "/x",
         "status": 200, "latencyMs": 10},
    ]
    result = metrics.analyze(events, "24h", NOW_MS)  # type: ignore[arg-type]
    assert result["volume"]["total"] == 1


def test_events_outside_the_labelled_grid_fall_into_the_last_bucket():
    far_future = [{"ts": NOW_MS + 10 * HOUR, "keyId": "k", "ownerId": "u",
                   "path": "/x", "status": 200, "latencyMs": 5}]
    result = metrics.analyze(far_future, "24h", NOW_MS)
    assert result["volume"]["total"] == 1
    assert result["timeseries"][-1]["count"] == 1


def test_arabic_insights_describe_a_real_window():
    events = make_events(hours=3, per_hour=6, status=503)
    result = metrics.analyze(events, "24h", NOW_MS)
    insights = "\n".join(result["insights"])
    assert "18" in insights  # request count
    assert "معدل الأخطاء" in insights
