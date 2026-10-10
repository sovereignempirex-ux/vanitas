"""Arabic Markdown report + CSV exports."""

from __future__ import annotations

import csv
import io

from app import metrics, report

from conftest import NOW_MS, make_events


def _analysis(**kwargs):
    events = kwargs.pop("events", None) or make_events(hours=4, per_hour=5, status=500)
    return metrics.analyze(events, "24h", NOW_MS)


def test_markdown_report_has_every_section():
    text = report.build_markdown(_analysis())
    assert text.startswith("# تقرير تحليل البيانات")
    for heading in (
        "## 🔢 ملخص الحجم",
        "## ⏱️ زمن الاستجابة (ms)",
        "## 🩺 الحالة والأخطاء",
        "## 🎯 اتفاقية مستوى الخدمة (SLO)",
        "## 🛤️ أكثر المسارات استخدامًا",
        "## 📌 خلاصة",
    ):
        assert heading in text
    assert "| إجمالي الطلبات | 20 |" in text
    assert "100%" in text  # every request failed → error rate column
    assert "`/api/v1/public/ping`" in text


def test_markdown_report_of_an_empty_window_is_still_valid():
    text = report.build_markdown(metrics.analyze([], "7d", NOW_MS))
    assert "# تقرير تحليل البيانات — آخر 7 أيام" in text
    assert "لا توجد بيانات" in text
    assert "—" in text  # missing values render as an em dash, never as "None"


def test_report_never_leaks_python_none():
    text = report.build_markdown(metrics.analyze([], "24h", NOW_MS))
    assert "None" not in text
    assert "null" not in text


def test_timeseries_csv_round_trips():
    analysis = _analysis()
    raw = report.build_timeseries_csv(analysis)
    rows = list(csv.reader(io.StringIO(raw)))
    assert rows[0] == ["bucket", "requests", "errors", "throttled", "avg_ms", "p95_ms"]
    assert len(rows) == 1 + 24
    assert sum(int(row[1]) for row in rows[1:]) == analysis["volume"]["total"]


def test_endpoints_csv_lists_every_path():
    analysis = _analysis()
    raw = report.build_endpoints_csv(analysis)
    rows = list(csv.reader(io.StringIO(raw)))
    assert rows[0] == ["path", "requests", "share_pct", "error_rate_pct", "p95_ms"]
    assert len(rows) == 1 + len(analysis["endpoints"])
    assert rows[1][0] == "/api/v1/public/ping"


def test_empty_csv_still_has_a_header():
    rows = list(csv.reader(io.StringIO(report.build_timeseries_csv({"timeseries": []}))))
    assert rows == [["bucket", "requests", "errors", "throttled", "avg_ms", "p95_ms"]]
