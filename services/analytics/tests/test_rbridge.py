"""Trend statistics: Python engine, R engine, and the R output parser."""

from __future__ import annotations

from app import rbridge

from conftest import HOUR, NOW_MS, make_events


def test_linear_regression_recovers_a_perfect_line():
    fit = rbridge.linear_regression([1.0, 2.0, 3.0, 4.0])
    assert fit["slope"] == 1.0
    assert fit["intercept"] == 1.0
    assert fit["rSquared"] == 1.0


def test_linear_regression_of_a_constant_series_has_no_trend():
    fit = rbridge.linear_regression([5.0, 5.0, 5.0, 5.0])
    assert fit["slope"] == 0.0
    assert fit["rSquared"] == 0.0
    assert fit["intercept"] == 5.0


def test_linear_regression_of_too_few_points_is_stable():
    assert rbridge.linear_regression([])["slope"] == 0.0
    single = rbridge.linear_regression([7.0])
    assert single["slope"] == 0.0
    assert single["intercept"] == 7.0


def test_moving_average_averages_what_exists_early_on():
    assert rbridge.moving_average([1, 2, 3, 4], 3) == [1.0, 1.5, 2.0, 3.0]
    assert rbridge.moving_average([], 3) == []


def test_outliers_flag_a_real_spike_and_ignore_noise():
    labels = [f"b{i}" for i in range(24)]
    flat = [10] * 24
    assert rbridge.outliers(labels, flat) == []  # no dispersion

    spiked = [10] * 24
    spiked[5] = 200
    flagged = rbridge.outliers(labels, spiked)
    assert len(flagged) == 1
    assert flagged[0]["bucket"] == "b5"
    assert abs(flagged[0]["zscore"]) >= 2.5


def test_outliers_of_a_tiny_series_are_empty():
    assert rbridge.outliers(["only"], [999]) == []


def test_trend_uses_the_python_engine_when_r_is_absent(monkeypatch):
    monkeypatch.setattr(rbridge, "r_available", lambda: False)
    events = make_events(hours=6, per_hour=4)
    payload = rbridge.trend_analysis(events, "24h", NOW_MS)

    assert payload["engine"] == "python"
    assert "Python" in payload["note"]
    assert len(payload["period"]) == 24
    assert len(payload["counts"]) == 24
    assert len(payload["movingAverage"]) == 24
    assert sum(payload["counts"]) == 24
    assert payload["regression"]["rSquared"] >= 0
    assert payload["peakBucket"] is not None


def test_trend_falls_back_to_python_when_the_r_script_fails(monkeypatch):
    monkeypatch.setattr(rbridge, "r_available", lambda: True)
    monkeypatch.setattr(rbridge, "_run_r", lambda labels, counts: None)
    payload = rbridge.trend_analysis(make_events(hours=2), "24h", NOW_MS)
    assert payload["engine"] == "python"


def test_r_available_honours_a_custom_rscript_path(monkeypatch):
    monkeypatch.setenv("RSCRIPT_PATH", "/definitely/not/installed/Rscript")
    from app.config import reset_settings

    reset_settings()
    assert rbridge.r_available() is False


def test_r_available_probes_path_by_default(monkeypatch):
    from app.config import reset_settings

    monkeypatch.delenv("RSCRIPT_PATH", raising=False)
    reset_settings()
    monkeypatch.setattr(rbridge.shutil, "which", lambda name: None)
    assert rbridge.r_available() is False
    monkeypatch.setattr(rbridge.shutil, "which", lambda name: "/usr/bin/Rscript")
    assert rbridge.r_available() is True


def test_r_output_parser_builds_the_python_shape():
    stdout = "\n".join(
        [
            "slope=1.5000",
            "intercept=4.2500",
            "r2=0.9100",
            "ma=1.00,2.00,3.00",
            "peak=2026-10-04T21",
            "outliers=2026-10-04T03,2026-10-04T19",
        ]
    )
    labels = [f"l{i}" for i in range(4)]
    payload = rbridge._parse_r_output(stdout, labels, [1, 2, 3, 4])
    assert payload is not None
    assert payload["regression"] == {"slope": 1.5, "intercept": 4.25, "rSquared": 0.91}
    assert payload["movingAverage"] == [1.0, 2.0, 3.0]
    assert payload["peakBucket"] == "2026-10-04T21"
    assert [o["bucket"] for o in payload["outliers"]] == [
        "2026-10-04T03",
        "2026-10-04T19",
    ]
    assert payload["counts"] == [1, 2, 3, 4]


def test_r_output_parser_rejects_unusable_output():
    assert rbridge._parse_r_output("garbage", [], []) is None
    assert rbridge._parse_r_output("slope=not-a-number", [], []) is None


def test_r_script_file_exists_and_only_uses_base_r():
    from pathlib import Path

    script = Path(rbridge.__file__).resolve().parent.parent / "stats" / "trend.R"
    assert script.exists()
    source = script.read_text(encoding="utf-8")
    assert "library(" not in source  # base R only — no CRAN dependency
    assert "require(" not in source
    assert "readLines" in source
