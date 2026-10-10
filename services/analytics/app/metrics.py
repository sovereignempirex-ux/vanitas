"""Core usage analytics: percentiles, bucketing, trends and anomalies.

Pure functions over the platform's `ApiKeyUsageEvent` records
(`{ts, keyId, ownerId, path, status, latencyMs}`) — no I/O, no third-party
dependencies, so the whole analysis is unit-testable offline.

Percentile convention matches the TypeScript chart exactly:
`index = min(n - 1, max(0, ceil(p * n) - 1))` (nearest rank).
"""

from __future__ import annotations

import math
import statistics
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable, Sequence

# period → (bucket unit, number of buckets in the current window)
PERIODS: dict[str, tuple[str, int]] = {
    "24h": ("hour", 24),
    "7d": ("day", 7),
    "30d": ("day", 30),
}

# 429 is throttling, not an error — same split the platform's own chart uses.
THROTTLED = 429

_INSIGHT_Z = 2.5  # |z-score| needed before a bucket counts as an anomaly


def percentile(values: Sequence[float], p: float) -> float:
    """Nearest-rank percentile (`p` in 0..1) over an already-sorted sequence."""
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(p * len(ordered)) - 1))
    return float(ordered[index])


def _bucket_label(ts_ms: int, unit: str) -> str:
    moment = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return moment.strftime("%Y-%m-%dT%H") if unit == "hour" else moment.strftime("%Y-%m-%d")


def _window_start(now_ms: int, unit: str, count: int) -> int:
    """Epoch ms where the current window begins (UTC bucket boundary)."""
    moment = datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)
    if unit == "hour":
        floored = moment.replace(minute=0, second=0, microsecond=0)
    else:
        floored = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    seconds_per_bucket = 3600 if unit == "hour" else 86_400
    start = floored.timestamp() - seconds_per_bucket * (count - 1)
    return int(start * 1000)


def _round(value: float, digits: int = 2) -> float:
    """Round half-up on the shortest decimal repr — the way JS `Math.round` does.

    Python's built-in `round()` is banker's rounding (404.25 → 404.2) while the
    TypeScript fallback uses half-up (→ 404.3); the two engines must never
    disagree about a number the dashboard displays.
    """
    quantum = Decimal(1).scaleb(-digits)
    return float(Decimal(repr(float(value))).quantize(quantum, rounding=ROUND_HALF_UP))


def _num(value: float | int) -> str:
    """Render a number the way JavaScript's `String(n)` does.

    Python prints `1762.0`, JS prints `1762` — the Arabic summary lines must be
    byte-identical whichever engine produced them.
    """
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return str(number)


def _delta(current: int | float, previous: int | float | None) -> float | None:
    if previous is None or previous == 0:
        return None
    return _round((current - previous) / previous * 100, 1)


def _status_class(status: int) -> str:
    if status >= 500:
        return "5xx"
    if status >= 400:
        return "4xx"
    if status >= 300:
        return "3xx"
    return "2xx"


def _is_error(status: int) -> bool:
    return status >= 400 and status != THROTTLED


def _zscores(values: Sequence[float]) -> list[float]:
    """Z-score per value; all zeros when there is no dispersion to compare."""
    if len(values) < 2:
        return [0.0 for _ in values]
    mean = statistics.fmean(values)
    stdev = statistics.pstdev(values)
    if not stdev:
        return [0.0 for _ in values]
    return [(value - mean) / stdev for value in values]


def analyze(
    events: Iterable[dict[str, Any]],
    period: str = "24h",
    now_ms: int | None = None,
) -> dict[str, Any]:
    """Full analysis of one usage window (plus the previous one for trends)."""
    unit, count = PERIODS.get(period, PERIODS["24h"])
    now = now_ms if now_ms is not None else int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    start_ms = _window_start(now, unit, count)
    span_ms = now - start_ms
    previous_start = start_ms - span_ms

    current: list[dict[str, Any]] = []
    previous: list[dict[str, Any]] = []
    for raw in events:
        if not isinstance(raw, dict):
            continue
        ts = raw.get("ts")
        if not isinstance(ts, (int, float)):
            continue
        ts = int(ts)
        record = {
            "ts": ts,
            "keyId": str(raw.get("keyId") or ""),
            "ownerId": str(raw.get("ownerId") or ""),
            "path": str(raw.get("path") or "/"),
            "status": int(raw.get("status") or 0),
            "latencyMs": float(raw.get("latencyMs") or 0),
        }
        if ts >= start_ms:
            current.append(record)
        elif ts >= previous_start:
            previous.append(record)

    labels = _labels(start_ms, unit, count)
    buckets: dict[str, dict[str, Any]] = {
        label: {"label": label, "count": 0, "errors": 0, "throttled": 0, "latencies": []}
        for label in labels
    }

    by_path: dict[str, dict[str, Any]] = {}
    by_key: dict[str, dict[str, Any]] = {}
    latencies: list[float] = []
    status_classes = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
    errors = 0
    throttled = 0

    for record in current:
        label = _bucket_label(record["ts"], unit)
        bucket = buckets.get(label)
        if bucket is None:
            # Outside the labelled grid (clock skew) — fold into the closest.
            label = labels[-1]
            bucket = buckets[label]
        bucket["count"] += 1
        bucket["latencies"].append(record["latencyMs"])
        if record["status"] == THROTTLED:
            bucket["throttled"] += 1
            throttled += 1
        elif _is_error(record["status"]):
            bucket["errors"] += 1
            errors += 1
        status_classes[_status_class(record["status"])] += 1
        latencies.append(record["latencyMs"])

        path_entry = by_path.setdefault(
            record["path"], {"path": record["path"], "count": 0, "errors": 0, "latencies": []}
        )
        path_entry["count"] += 1
        path_entry["latencies"].append(record["latencyMs"])
        if _is_error(record["status"]) or record["status"] == THROTTLED:
            path_entry["errors"] += 1

        key_entry = by_key.setdefault(
            record["keyId"] or "unknown",
            {"keyId": record["keyId"] or "unknown", "count": 0, "errors": 0, "latencies": []},
        )
        key_entry["count"] += 1
        key_entry["latencies"].append(record["latencyMs"])
        if _is_error(record["status"]) or record["status"] == THROTTLED:
            key_entry["errors"] += 1

    previous_latency = [float(e.get("latencyMs") or 0) for e in previous]

    timeseries = []
    for label in labels:
        bucket = buckets[label]
        ordered = sorted(bucket["latencies"])
        timeseries.append(
            {
                "label": label,
                "count": bucket["count"],
                "errorCount": bucket["errors"],
                "throttledCount": bucket["throttled"],
                "p95": _round(percentile(ordered, 0.95), 1),
                "avg": _round(statistics.fmean(ordered), 1) if ordered else 0.0,
            }
        )

    total = len(current)
    previous_total = len(previous)
    error_rate = _round(errors / total * 100, 2) if total else 0.0
    previous_error_rate = (
        _round(sum(1 for e in previous if _is_error(int(e.get("status") or 0))) / previous_total * 100, 2)
        if previous_total
        else None
    )

    volume_counts = [float(point["count"]) for point in timeseries]
    error_counts = [float(point["errorCount"]) for point in timeseries]
    p95_series = [point["p95"] for point in timeseries]

    anomalies = []
    for point, z_volume, z_error, z_p95 in zip(
        timeseries, _zscores(volume_counts), _zscores(error_counts), _zscores(p95_series)
    ):
        if abs(z_volume) >= _INSIGHT_Z and point["count"] > 0:
            anomalies.append(
                {
                    "kind": "volume_spike" if z_volume > 0 else "volume_drop",
                    "bucket": point["label"],
                    "zscore": _round(z_volume),
                    "detail": f"{point['count']} طلب في {point['label']}",
                }
            )
        if abs(z_error) >= _INSIGHT_Z and point["errorCount"] > 0:
            anomalies.append(
                {
                    "kind": "error_spike",
                    "bucket": point["label"],
                    "zscore": _round(z_error),
                    "detail": f"{point['errorCount']} خطأ في {point['label']}",
                }
            )
        if abs(z_p95) >= _INSIGHT_Z and point["p95"] > 0:
            anomalies.append(
                {
                    "kind": "latency_spike",
                    "bucket": point["label"],
                    "zscore": _round(z_p95),
                    "detail": f"p95 = {_num(point['p95'])}ms في {point['label']}",
                }
            )

    volume_delta = _delta(total, previous_total)
    p95 = percentile(latencies, 0.95)
    previous_p95 = percentile(previous_latency, 0.95) if previous_latency else None

    return {
        "engine": "python",
        "period": period,
        "bucketUnit": unit,
        "generatedAt": datetime.fromtimestamp(now / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "window": {"from": start_ms, "to": now, "previousFrom": previous_start},
        "volume": {
            "total": total,
            "previous": previous_total if previous else None,
            "deltaPct": volume_delta,
            "trend": _trend(volume_delta),
            "peakBucket": max(timeseries, key=lambda point: point["count"]) if timeseries else None,
        },
        "latency": {
            "p50": _round(percentile(latencies, 0.50), 1),
            "p90": _round(percentile(latencies, 0.90), 1),
            "p95": _round(p95, 1),
            "p99": _round(percentile(latencies, 0.99), 1),
            "previousP95": _round(previous_p95, 1) if previous_p95 is not None else None,
            "p95DeltaPct": _delta(p95, previous_p95) if previous_p95 else None,
            "mean": _round(statistics.fmean(latencies), 1) if latencies else 0.0,
            "max": _round(max(latencies), 1) if latencies else 0.0,
        },
        "status": {
            "total": total,
            "byClass": status_classes,
            "errors": errors,
            "throttled": throttled,
            "errorRatePct": error_rate,
            "previousErrorRatePct": previous_error_rate,
            "errorRateDeltaPct": (
                _delta(error_rate, previous_error_rate) if previous_error_rate is not None else None
            ),
            "topFailingPaths": _top_failing(by_path),
        },
        "endpoints": _rank(by_path.values()),
        "keys": _rank(by_key.values()),
        "slo": {
            "under100msPct": _share(latencies, 100),
            "under500msPct": _share(latencies, 500),
            "under1sPct": _share(latencies, 1000),
        },
        "timeseries": timeseries,
        "anomalies": anomalies,
        "insights": _insights(
            total=total,
            volume_delta=volume_delta,
            error_rate=error_rate,
            previous_error_rate=previous_error_rate,
            p95=p95,
            previous_p95=previous_p95,
            anomalies=anomalies,
            throttled=throttled,
        ),
    }


def _labels(start_ms: int, unit: str, count: int) -> list[str]:
    step = 3_600_000 if unit == "hour" else 86_400_000
    return [_bucket_label(start_ms + index * step, unit) for index in range(count)]


def _trend(delta: float | None) -> str:
    if delta is None:
        return "unknown"
    if delta > 5:
        return "up"
    if delta < -5:
        return "down"
    return "flat"


def _share(values: Sequence[float], ceiling: float) -> float:
    if not values:
        return 0.0
    return _round(sum(1 for value in values if value <= ceiling) / len(values) * 100, 1)


def _rank(entries: Iterable[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    ranked = []
    total = sum(int(entry["count"]) for entry in entries) or 1
    for entry in entries:
        ordered = sorted(entry["latencies"])
        ranked.append(
            {
                "path": entry.get("path"),
                "keyId": entry.get("keyId"),
                "count": entry["count"],
                "errorRatePct": _round(entry["errors"] / entry["count"] * 100, 2),
                "p95": _round(percentile(ordered, 0.95), 1),
                "sharePct": _round(entry["count"] / total * 100, 1),
            }
        )
    ranked.sort(key=lambda item: item["count"], reverse=True)
    return ranked[:limit]


def _top_failing(by_path: dict[str, dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    failing = [
        {
            "path": entry["path"],
            "errors": entry["errors"],
            "count": entry["count"],
            "errorRatePct": _round(entry["errors"] / entry["count"] * 100, 2),
        }
        for entry in by_path.values()
        if entry["errors"] > 0
    ]
    failing.sort(key=lambda item: (item["errorRatePct"], item["errors"]), reverse=True)
    return failing[:limit]


def _insights(
    *,
    total: int,
    volume_delta: float | None,
    error_rate: float,
    previous_error_rate: float | None,
    p95: float,
    previous_p95: float | None,
    anomalies: list[dict[str, Any]],
    throttled: int,
) -> list[str]:
    """Human-readable Arabic summary lines for the dashboard."""
    lines: list[str] = []
    if total == 0:
        return ["لا توجد بيانات استخدام في هذه الفترة."]

    if volume_delta is None:
        lines.append(f"تم تسجيل {total} طلب في الفترة الحالية.")
    else:
        direction = "ارتفع" if volume_delta > 0 else "انخفض" if volume_delta < 0 else "ثبّت"
        lines.append(
            f"{direction} حجم الطلبات {_num(abs(volume_delta))}% ({total} طلب مقابل فترة سابقة)."
        )

    if previous_error_rate is None:
        lines.append(f"معدل الأخطاء الحالي {_num(error_rate)}%.")
    else:
        diff = round(error_rate - previous_error_rate, 2)
        if diff > 0:
            lines.append(f"معدل الأخطاء ارتفع {_num(diff)}% مقارنة بالفترة السابقة.")
        elif diff < 0:
            lines.append(f"معدل الأخطاء انخفض {_num(abs(diff))}% مقارنة بالفترة السابقة.")
        else:
            lines.append(f"معدل الأخطاء ثابت عند {_num(error_rate)}%.")

    if previous_p95:
        diff_pct = _delta(p95, previous_p95)
        if diff_pct is not None and abs(diff_pct) >= 5:
            verb = "تحسّن" if diff_pct < 0 else "تدهور"
            lines.append(f"زمن الاستجابة p95 {verb} {_num(abs(diff_pct))}% (الآن {_num(p95)}ms).")
        else:
            lines.append(f"زمن الاستجابة p95 مستقر عند {_num(p95)}ms.")
    else:
        lines.append(f"زمن الاستجابة p95 = {_num(p95)}ms.")

    if throttled:
        lines.append(f"{throttled} طلب تم تقييدها بـ 429 (Rate Limit).")

    for anomaly in anomalies[:3]:
        lines.append(f"⚠️ شذوذ: {anomaly['kind']} — {anomaly['detail']}")
    return lines
