"""SVG chart generation — the markup must parse as XML and carry real data."""

from __future__ import annotations

import xml.etree.ElementTree as ET

from app import charts, metrics

from conftest import NOW_MS, make_events


def _analysis(**kwargs):
    events = kwargs.pop("events", None) or make_events(hours=6, per_hour=3)
    return metrics.analyze(events, "24h", NOW_MS)


def test_timeseries_chart_is_well_formed_xml():
    svg = charts.timeseries_chart_svg(_analysis())
    root = ET.fromstring(svg)
    assert root.tag.endswith("svg")
    assert root.get("viewBox") == "0 0 960 300"
    assert root.get("aria-label")


def test_timeseries_chart_draws_all_buckets():
    analysis = _analysis()
    svg = charts.timeseries_chart_svg(analysis)
    root = ET.fromstring(svg)
    # Only the volume bars share the volume fill (legend swatches use solid colours).
    bars = [node for node in root if node.tag.endswith("rect") and node.get("fill") == charts.COLOR_VOLUME_FILL]
    assert len(bars) == len(analysis["timeseries"])
    # One p95 polyline + one errors polyline, each with a point per bucket.
    polylines = [node for node in root if node.tag.endswith("polyline")]
    assert len(polylines) == 2
    for line in polylines:
        assert len(line.get("points", "").split()) == len(analysis["timeseries"])


def test_timeseries_chart_of_an_empty_window_is_a_placeholder():
    svg = charts.timeseries_chart_svg(metrics.analyze([], "24h", NOW_MS))
    root = ET.fromstring(svg)
    texts = [node for node in root if node.tag.endswith("text")]
    assert any("لا توجد بيانات" in (node.text or "") for node in texts)


def test_ranking_bar_chart_is_well_formed_and_labels_are_escaped():
    items = [
        {"path": "/a&b <x>", "count": 5},
        {"path": "/c", "count": 2},
    ]
    svg = charts.ranking_bar_svg(items, title="تقرير & مقارنة")
    root = ET.fromstring(svg)  # would raise on an unescaped '&'
    rects = [node for node in root if node.tag.endswith("rect")]
    assert len(rects) == 2 + 2  # track + filled bar per row
    text = ET.tostring(root, encoding="unicode")
    assert "/a&amp;b &lt;x&gt;" in text


def test_ranking_bar_chart_of_nothing_is_a_placeholder():
    root = ET.fromstring(charts.ranking_bar_svg([]))
    assert root.get("aria-label")


def test_chart_text_never_contains_bare_ampersand():
    svg = charts.ranking_bar_svg([{"path": "a & b", "count": 1}])
    ET.fromstring(svg)
