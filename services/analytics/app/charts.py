"""Dependency-free SVG charts for the dashboard.

matplotlib would add a heavy native dependency for two chart types; plain SVG
is a string, so it renders anywhere (browser, docs, email) and stays testable
by parsing the markup with `xml.etree`.
"""

from __future__ import annotations

from typing import Any, Sequence
from xml.sax.saxutils import escape

# Vanitas palette (matches the dashboard's blue/cyan accents).
COLOR_VOLUME = "#3b82f6"
COLOR_VOLUME_FILL = "rgba(59,130,246,.28)"
COLOR_ERRORS = "#f43f5e"
COLOR_P95 = "#22d3ee"
COLOR_GRID = "rgba(148,163,184,.25)"
COLOR_TEXT = "#94a3b8"
COLOR_BAR = "#6366f1"


def _points(values: Sequence[float], left: float, top: float, width: float, height: float, maximum: float) -> list[tuple[float, float]]:
    if len(values) < 2:
        denominator = max(1, len(values) - 1)
        return [
            (left + (index / denominator) * width, top + height - (value / maximum) * height)
            for index, value in enumerate(values)
        ]
    step = width / (len(values) - 1)
    return [
        (left + index * step, top + height - (value / maximum) * height)
        for index, value in enumerate(values)
    ]


def timeseries_chart_svg(
    analysis: dict[str, Any],
    *,
    width: int = 960,
    height: int = 300,
) -> str:
    """Bars = requests per bucket, line = p95 latency, red line = errors."""
    series = analysis.get("timeseries") or []
    # An all-zero window deserves a message, not an empty grid of bars.
    if not series or not any(int(point.get("count") or 0) for point in series):
        return _empty_svg(width, height, "لا توجد بيانات لعرضها")

    padding_left, padding_right, padding_top, padding_bottom = 46, 16, 18, 34
    plot_w = width - padding_left - padding_right
    plot_h = height - padding_top - padding_bottom

    counts = [float(point["count"]) for point in series]
    errors = [float(point["errorCount"]) for point in series]
    p95 = [float(point["p95"]) for point in series]

    max_count = max(max(counts), 1.0)
    max_p95 = max(max(p95), 1.0)
    slot = plot_w / len(series)
    bar_w = max(2.0, slot * 0.62)

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="100%" height="{height}" role="img" '
        f'aria-label="حجم الطلبات وزمن الاستجابة عبر الزمن">',
        f'<rect width="{width}" height="{height}" fill="transparent"/>',
    ]

    # Horizontal grid + left axis labels (requests).
    for step in range(5):
        y = padding_top + (plot_h / 4) * step
        value = max_count * (1 - step / 4)
        parts.append(
            f'<line x1="{padding_left}" y1="{y:.1f}" x2="{width - padding_right}" y2="{y:.1f}" '
            f'stroke="{COLOR_GRID}" stroke-dasharray="3 4"/>'
        )
        parts.append(
            f'<text x="{padding_left - 8}" y="{y + 4:.1f}" text-anchor="end" '
            f'font-size="11" fill="{COLOR_TEXT}">{int(round(value))}</text>'
        )

    # Right axis labels (p95 ms).
    for step in range(5):
        y = padding_top + (plot_h / 4) * step
        value = max_p95 * (1 - step / 4)
        parts.append(
            f'<text x="{width - padding_right + 6}" y="{y + 4:.1f}" text-anchor="start" '
            f'font-size="11" fill="{COLOR_P95}">{int(round(value))}ms</text>'
        )

    # Request bars.
    for index, value in enumerate(counts):
        bar_h = (value / max_count) * plot_h
        x = padding_left + index * slot + (slot - bar_w) / 2
        y = padding_top + plot_h - bar_h
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{max(bar_h, 0):.1f}" '
            f'rx="2" fill="{COLOR_VOLUME_FILL}"/>'
        )

    # p95 line.
    p95_points = _points(p95, padding_left + slot / 2, padding_top, plot_w - slot, plot_h, max_p95)
    parts.append(
        f'<polyline fill="none" stroke="{COLOR_P95}" stroke-width="2" points="'
        + " ".join(f"{x:.1f},{y:.1f}" for x, y in p95_points)
        + '"/>'
    )

    # Errors line.
    error_points = _points(errors, padding_left + slot / 2, padding_top, plot_w - slot, plot_h, max(max_count, 1.0))
    parts.append(
        f'<polyline fill="none" stroke="{COLOR_ERRORS}" stroke-width="1.6" stroke-dasharray="5 4" points="'
        + " ".join(f"{x:.1f},{y:.1f}" for x, y in error_points)
        + '"/>'
    )

    # Bucket labels — every Nth so they never overlap.
    label_every = max(1, round(len(series) / 8))
    for index, point in enumerate(series):
        if index % label_every:
            continue
        x = padding_left + index * slot + slot / 2
        parts.append(
            f'<text x="{x:.1f}" y="{height - 12}" text-anchor="middle" font-size="10" '
            f'fill="{COLOR_TEXT}">{escape(str(point["label"]))}</text>'
        )

    # Legend.
    legend = [
        (COLOR_VOLUME, "الطلبات"),
        (COLOR_P95, "p95"),
        (COLOR_ERRORS, "الأخطاء"),
    ]
    x_cursor = padding_left
    for color, label in legend:
        parts.append(f'<rect x="{x_cursor}" y="{padding_top - 12}" width="10" height="10" rx="2" fill="{color}"/>')
        parts.append(
            f'<text x="{x_cursor + 14}" y="{padding_top - 3}" font-size="11" fill="{COLOR_TEXT}">'
            f"{escape(label)}</text>"
        )
        x_cursor += 78

    parts.append("</svg>")
    return "".join(parts)


def ranking_bar_svg(
    items: Sequence[dict[str, Any]],
    *,
    label_key: str = "path",
    value_key: str = "count",
    title: str = "",
    width: int = 960,
    row_height: int = 26,
) -> str:
    """Horizontal bars for a top-N ranking (endpoints or keys)."""
    if not items:
        return _empty_svg(width, 60, "لا توجد بيانات لعرضها")

    height = 34 + row_height * len(items)
    label_w = 300
    value_w = 70
    plot_w = width - label_w - value_w - 24
    maximum = max(float(item.get(value_key) or 0) for item in items) or 1.0

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="100%" height="{height}" role="img" aria-label="{escape(title)}">',
    ]
    if title:
        parts.append(
            f'<text x="8" y="18" font-size="13" fill="{COLOR_TEXT}" font-weight="600">{escape(title)}</text>'
        )

    for index, item in enumerate(items):
        y = 34 + index * row_height
        value = float(item.get(value_key) or 0)
        bar_w = (value / maximum) * plot_w
        label = str(item.get(label_key) or item.get("keyId") or "—")
        parts.append(
            f'<text x="8" y="{y + 13}" font-size="11" fill="{COLOR_TEXT}">{escape(label[:46])}</text>'
        )
        parts.append(
            f'<rect x="{label_w}" y="{y + 4}" width="{plot_w}" height="14" rx="7" fill="rgba(99,102,241,.12)"/>'
        )
        parts.append(
            f'<rect x="{label_w}" y="{y + 4}" width="{max(bar_w, 2):.1f}" height="14" rx="7" fill="{COLOR_BAR}"/>'
        )
        parts.append(
            f'<text x="{label_w + plot_w + 8}" y="{y + 15}" font-size="11" fill="{COLOR_TEXT}">'
            f"{int(value)}</text>"
        )

    parts.append("</svg>")
    return "".join(parts)


def _empty_svg(width: int, height: int, message: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="100%" height="{height}" role="img" aria-label="{escape(message)}">'
        f'<text x="{width / 2}" y="{height / 2}" text-anchor="middle" font-size="14" '
        f'fill="{COLOR_TEXT}">{escape(message)}</text></svg>'
    )
