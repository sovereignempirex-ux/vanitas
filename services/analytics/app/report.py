"""Report builders: an Arabic Markdown summary and a machine-readable CSV.

Both consume the exact dict produced by `app.metrics.analyze` so the report
and the dashboard can never disagree about the numbers.
"""

from __future__ import annotations

import csv
import io
from typing import Any

from .metrics import _num

PERIOD_LABELS = {"24h": "آخر 24 ساعة", "7d": "آخر 7 أيام", "30d": "آخر 30 يوم"}


def _fmt(value: Any, suffix: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        text = f"{value:,.2f}".rstrip("0").rstrip(".")
    else:
        text = f"{value:,}"
    return f"{text}{suffix}"


def build_markdown(analysis: dict[str, Any]) -> str:
    """Arabic Markdown report derived from one analysis payload."""
    volume = analysis.get("volume", {})
    latency = analysis.get("latency", {})
    status = analysis.get("status", {})
    slo = analysis.get("slo", {})
    period = analysis.get("period", "24h")

    lines: list[str] = []
    lines.append(f"# تقرير تحليل البيانات — {PERIOD_LABELS.get(period, period)}")
    lines.append("")
    lines.append(f"*تم التوليد في {analysis.get('generatedAt', '—')} · المحرك: {analysis.get('engine', 'python')}*")
    lines.append("")

    lines.append("## 🔢 ملخص الحجم")
    lines.append("")
    lines.append("| المؤشر | القيمة |")
    lines.append("| --- | --- |")
    lines.append(f"| إجمالي الطلبات | {_fmt(volume.get('total'))} |")
    previous = volume.get("previous")
    lines.append(f"| الفترة السابقة | {_fmt(previous)} |")
    lines.append(f"| التغير | {_fmt(volume.get('deltaPct'), '%') if volume.get('deltaPct') is not None else '—'} |")
    peak = volume.get("peakBucket") or {}
    lines.append(f"| أعلى فترة | {_fmt(peak.get('count'))} طلب ({peak.get('label', '—')}) |")
    lines.append("")

    lines.append("## ⏱️ زمن الاستجابة (ms)")
    lines.append("")
    lines.append("| p50 | p90 | p95 | p99 | المتوسط | الأقصى |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    lines.append(
        f"| {_fmt(latency.get('p50'))} | {_fmt(latency.get('p90'))} | "
        f"{_fmt(latency.get('p95'))} | {_fmt(latency.get('p99'))} | "
        f"{_fmt(latency.get('mean'))} | {_fmt(latency.get('max'))} |"
    )
    lines.append("")

    lines.append("## 🩺 الحالة والأخطاء")
    lines.append("")
    by_class = status.get("byClass", {})
    lines.append("| 2xx | 3xx | 4xx | 5xx | حُصّر (429) | معدل الخطأ |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    lines.append(
        f"| {_fmt(by_class.get('2xx'))} | {_fmt(by_class.get('3xx'))} | "
        f"{_fmt(by_class.get('4xx'))} | {_fmt(by_class.get('5xx'))} | "
        f"{_fmt(status.get('throttled'))} | {_fmt(status.get('errorRatePct'), '%')} |"
    )
    lines.append("")

    failing = status.get("topFailingPaths") or []
    if failing:
        lines.append("### أكثر المسارات خطأً")
        lines.append("")
        lines.append("| المسار | الأخطاء | الطلبات | نسبة الخطأ |")
        lines.append("| --- | --- | --- | --- |")
        for item in failing:
            lines.append(
                f"| `{item['path']}` | {_fmt(item['errors'])} | "
                f"{_fmt(item['count'])} | {_fmt(item['errorRatePct'], '%')} |"
            )
        lines.append("")

    lines.append("## 🎯 اتفاقية مستوى الخدمة (SLO)")
    lines.append("")
    lines.append(f"- تحت 100ms: **{_fmt(slo.get('under100msPct'), '%')}**")
    lines.append(f"- تحت 500ms: **{_fmt(slo.get('under500msPct'), '%')}**")
    lines.append(f"- تحت 1s: **{_fmt(slo.get('under1sPct'), '%')}**")
    lines.append("")

    endpoints = analysis.get("endpoints") or []
    if endpoints:
        lines.append("## 🛤️ أكثر المسارات استخدامًا")
        lines.append("")
        lines.append("| المسار | الطلبات | الحصة | p95 | نسبة الخطأ |")
        lines.append("| --- | --- | --- | --- | --- |")
        for item in endpoints[:8]:
            lines.append(
                f"| `{item.get('path') or item.get('keyId')}` | {_fmt(item['count'])} | "
                f"{_fmt(item['sharePct'], '%')} | {_fmt(item['p95'])} | "
                f"{_fmt(item['errorRatePct'], '%')} |"
            )
        lines.append("")

    anomalies = analysis.get("anomalies") or []
    if anomalies:
        lines.append("## ⚠️ الشذوذات المكتشفة")
        lines.append("")
        for anomaly in anomalies:
            lines.append(
                f"- `{anomaly['kind']}` في {anomaly['bucket']} "
                f"(z = {anomaly['zscore']}) — {anomaly['detail']}"
            )
        lines.append("")

    insights = analysis.get("insights") or []
    if insights:
        lines.append("## 📌 خلاصة")
        lines.append("")
        for line in insights:
            lines.append(f"- {line}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_timeseries_csv(analysis: dict[str, Any]) -> str:
    """CSV of the bucketed series (openable in Excel/Sheets directly)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["bucket", "requests", "errors", "throttled", "avg_ms", "p95_ms"])
    for point in analysis.get("timeseries") or []:
        writer.writerow(
            [
                point.get("label"),
                _num(point.get("count") or 0),
                _num(point.get("errorCount") or 0),
                _num(point.get("throttledCount") or 0),
                _num(point.get("avg") or 0),
                _num(point.get("p95") or 0),
            ]
        )
    return buffer.getvalue()


def build_endpoints_csv(analysis: dict[str, Any]) -> str:
    """CSV of the per-endpoint ranking."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["path", "requests", "share_pct", "error_rate_pct", "p95_ms"])
    for item in analysis.get("endpoints") or []:
        writer.writerow(
            [
                item.get("path"),
                _num(item.get("count") or 0),
                _num(item.get("sharePct") or 0),
                _num(item.get("errorRatePct") or 0),
                _num(item.get("p95") or 0),
            ]
        )
    return buffer.getvalue()
