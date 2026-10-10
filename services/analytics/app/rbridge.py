"""Trend statistics — R when available, Python otherwise (same output shape).

Data analysis is the domain R is built for, so the platform ships an R script
(`stats/trend.R`, base R only — no CRAN packages needed) and uses it whenever
`Rscript` is on PATH. Machines without R get the identical numbers from a
small pure-Python implementation, so the service never fails to answer.
"""

from __future__ import annotations

import csv
import io
import json
import math
import shutil
import statistics
import subprocess
from typing import Any, Sequence

from .config import get_settings
from .metrics import PERIODS, _bucket_label, _labels, _window_start

MOVING_AVERAGE_WINDOW = 3
OUTLIER_Z = 2.5
_R_TIMEOUT_S = 15


def r_available() -> bool:
    """True when an Rscript binary can be found."""
    settings = get_settings()
    if settings.rscript_path and settings.rscript_path != "Rscript":
        import os

        return os.path.exists(settings.rscript_path)
    return shutil.which("Rscript") is not None


def _series(events: Sequence[dict[str, Any]], period: str, now_ms: int | None) -> tuple[list[str], list[int]]:
    unit, count = PERIODS.get(period, PERIODS["24h"])
    now = now_ms if now_ms is not None else _now_ms()
    start = _window_start(now, unit, count)
    labels = _labels(start, unit, count)
    counts = [0] * len(labels)
    index_of = {label: position for position, label in enumerate(labels)}
    for event in events:
        ts = event.get("ts") if isinstance(event, dict) else None
        if not isinstance(ts, (int, float)):
            continue
        position = index_of.get(_bucket_label(int(ts), unit))
        if position is not None:
            counts[position] += 1
    return labels, counts


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)


def trend_analysis(
    events: Sequence[dict[str, Any]],
    period: str = "24h",
    now_ms: int | None = None,
) -> dict[str, Any]:
    """Regression + moving average + outliers over the bucketed request volume."""
    labels, counts = _series(events, period, now_ms)
    payload = _python_trend(labels, counts)
    payload["engine"] = "python"
    payload["note"] = (
        "لم يتم العثور على Rscript — تم حساب الاتجاهات بمحرك Python المدمج."
    )

    if r_available():
        r_payload = _run_r(labels, counts)
        if r_payload is not None:
            r_payload["engine"] = "r"
            r_payload["note"] = "تم حساب الاتجاهات بـ R (stats/trend.R)."
            return r_payload
    return payload


def _python_trend(labels: Sequence[str], counts: Sequence[int]) -> dict[str, Any]:
    regression = linear_regression([float(value) for value in counts])
    return {
        "period": list(labels),
        "counts": list(counts),
        "regression": regression,
        "movingAverage": moving_average(list(counts), MOVING_AVERAGE_WINDOW),
        "peakBucket": labels[counts.index(max(counts))] if counts and max(counts) > 0 else None,
        "outliers": outliers(labels, counts),
    }


def linear_regression(values: Sequence[float]) -> dict[str, float]:
    """Least-squares fit of value ~ index; returns slope/intercept/rSquared."""
    n = len(values)
    if n < 2:
        return {"slope": 0.0, "intercept": float(values[0]) if values else 0.0, "rSquared": 0.0}
    xs = list(range(n))
    mean_x = statistics.fmean(xs)
    mean_y = statistics.fmean(values)
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return {"slope": 0.0, "intercept": mean_y, "rSquared": 0.0}
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, values)) / denom
    intercept = mean_y - slope * mean_x
    fitted = [intercept + slope * x for x in xs]
    ss_res = sum((y - f) ** 2 for y, f in zip(values, fitted))
    ss_tot = sum((y - mean_y) ** 2 for y in values)
    r_squared = 0.0 if ss_tot == 0 else max(0.0, 1 - ss_res / ss_tot)
    return {
        "slope": round(slope, 4),
        "intercept": round(intercept, 4),
        "rSquared": round(r_squared, 4),
    }


def moving_average(values: Sequence[int], window: int) -> list[float]:
    """Trailing moving average; early points average what exists so far."""
    if not values:
        return []
    result: list[float] = []
    for index in range(len(values)):
        chunk = values[max(0, index - window + 1) : index + 1]
        result.append(round(statistics.fmean(chunk), 2))
    return result


def outliers(labels: Sequence[str], counts: Sequence[int]) -> list[dict[str, Any]]:
    """Buckets at least `OUTLIER_Z` standard deviations from the mean."""
    if len(counts) < 2:
        return []
    mean = statistics.fmean(counts)
    stdev = statistics.pstdev(counts)
    if not stdev:
        return []
    flagged = []
    for label, value in zip(labels, counts):
        z = (value - mean) / stdev
        if abs(z) >= OUTLIER_Z:
            flagged.append({"bucket": label, "count": value, "zscore": round(z, 2)})
    return flagged


def _run_r(labels: Sequence[str], counts: Sequence[int]) -> dict[str, Any] | None:
    """Run stats/trend.R with a CSV on stdin; None when R is unusable."""
    import os
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "stats" / "trend.R"
    if not script.exists():
        return None

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["bucket", "count"])
    for label, count in zip(labels, counts):
        writer.writerow([label, count])

    try:
        completed = subprocess.run(
            [get_settings().rscript_path, str(script)],
            input=buffer.getvalue(),
            capture_output=True,
            text=True,
            timeout=_R_TIMEOUT_S,
            check=False,
            env={**os.environ},
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    return _parse_r_output(completed.stdout, labels, counts)


def _parse_r_output(stdout: str, labels: Sequence[str], counts: Sequence[int]) -> dict[str, Any] | None:
    """R prints flat `key=value` lines — base R has no JSON writer."""
    fields: dict[str, str] = {}
    for line in stdout.splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            fields[key.strip()] = value.strip()
    if "slope" not in fields:
        return None
    try:
        return {
            "period": list(labels),
            "counts": list(counts),
            "regression": {
                "slope": float(fields.get("slope", 0)),
                "intercept": float(fields.get("intercept", 0)),
                "rSquared": float(fields.get("r2", 0)),
            },
            "movingAverage": [
                float(value) for value in fields.get("ma", "").split(",") if value.strip()
            ]
            or moving_average(list(counts), MOVING_AVERAGE_WINDOW),
            "peakBucket": fields.get("peak") or None,
            "outliers": [
                {"bucket": bucket, "count": None, "zscore": None}
                for bucket in fields.get("outliers", "").split(",")
                if bucket.strip()
            ],
        }
    except (TypeError, ValueError):
        return None


def encode(payload: dict[str, Any]) -> str:
    """Compact JSON helper shared with the CLI entry point."""
    return json.dumps(payload, ensure_ascii=False)
