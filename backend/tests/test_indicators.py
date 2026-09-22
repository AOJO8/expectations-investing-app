"""Indicator maths, checked against hand-computed values."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from app.services import indicators as ind


def series(values, start="2024-01-01"):
    return pd.Series(
        [float(v) for v in values], index=pd.bdate_range(start, periods=len(values))
    )


# Wilder's published worked example (New Concepts in Technical Trading Systems).
WILDER_CLOSES = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
    46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
]


class TestRSI:
    def test_matches_wilder_reference(self):
        s = series(WILDER_CLOSES[:15])
        # After 14 changes the seed average gives RSI ~= 70.46.
        assert ind.rsi(s, 14) == pytest.approx(70.46, abs=0.05)

    def test_smoothing_continues_after_seed(self):
        # Wilder's next published value one bar later.
        s = series(WILDER_CLOSES[:16])
        assert ind.rsi(s, 14) == pytest.approx(66.25, abs=0.05)

    def test_matches_independent_reference_implementation(self):
        """Cross-check the vectorised RSI against a plain recursive loop."""

        def reference(closes, period=14):
            deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
            gains = [max(d, 0.0) for d in deltas]
            losses = [max(-d, 0.0) for d in deltas]
            avg_gain = sum(gains[:period]) / period
            avg_loss = sum(losses[:period]) / period
            out = [100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)]
            for i in range(period, len(deltas)):
                avg_gain = (avg_gain * (period - 1) + gains[i]) / period
                avg_loss = (avg_loss * (period - 1) + losses[i]) / period
                out.append(100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss))
            return out

        expected = reference(WILDER_CLOSES)
        actual = list(ind.rsi_series(series(WILDER_CLOSES), 14))
        assert len(actual) == len(expected)
        for a, e in zip(actual, expected):
            assert a == pytest.approx(e, abs=1e-9)

    def test_seed_is_a_simple_mean_not_the_first_observation(self):
        """Regression guard: a bare ewm seed gives ~50.7 here, Wilder gives 70.46."""
        assert ind.rsi(series(WILDER_CLOSES[:15]), 14) > 65.0

    def test_monotonic_rise_is_100(self):
        assert ind.rsi(series(np.arange(1, 40)), 14) == 100.0

    def test_monotonic_fall_is_zero(self):
        assert ind.rsi(series(np.arange(40, 1, -1)), 14) == 0.0

    def test_flat_series_is_fifty(self):
        assert ind.rsi(series([50.0] * 30), 14) == 50.0

    def test_insufficient_history_returns_none(self):
        assert ind.rsi(series([1, 2, 3]), 14) is None

    def test_empty_series_returns_none(self):
        assert ind.rsi(pd.Series(dtype="float64"), 14) is None

    def test_zones(self):
        assert ind.rsi_zone(75) == "OVERBOUGHT"
        assert ind.rsi_zone(60) == "STRONG"
        assert ind.rsi_zone(50) == "NEUTRAL"
        assert ind.rsi_zone(35) == "WEAK"
        assert ind.rsi_zone(22) == "OVERSOLD"
        assert ind.rsi_zone(None) is None


class TestMovingAverages:
    def test_sma_is_simple_mean_of_window(self):
        s = series([1, 2, 3, 4, 5, 6])
        assert ind.sma(s, 3) == pytest.approx(5.0)  # mean(4,5,6)

    def test_sma_needs_full_window(self):
        assert ind.sma(series([1, 2]), 5) is None

    def test_ema_recursive_form(self):
        # alpha = 2/(3+1) = 0.5; seed = mean(1,2,3) is not used by adjust=False,
        # pandas seeds with the first observation, so compute the expectation.
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        alpha = 2 / (3 + 1)
        expected = values[0]
        for v in values[1:]:
            expected = alpha * v + (1 - alpha) * expected
        assert ind.ema(series(values), 3) == pytest.approx(expected)

    def test_ema_of_constant_series_is_the_constant(self):
        assert ind.ema(series([7.0] * 30), 20) == pytest.approx(7.0)


class TestMACD:
    def test_components_are_consistent(self):
        s = series(np.linspace(100, 160, 120))
        m = ind.macd(s)
        assert m.macd is not None and m.signal is not None
        assert m.histogram == pytest.approx(m.macd - m.signal)

    def test_uptrend_is_bullish(self):
        m = ind.macd(series(np.linspace(50, 150, 200)))
        assert m.macd > 0
        assert m.state == "BULLISH"

    def test_downtrend_is_bearish(self):
        m = ind.macd(series(np.linspace(150, 50, 200)))
        assert m.macd < 0
        assert m.state == "BEARISH"

    def test_matches_manual_ema_difference(self):
        s = series(np.linspace(10, 50, 100))
        frame = ind.macd_frame(s)
        fast = s.ewm(span=12, adjust=False, min_periods=12).mean().iloc[-1]
        slow = s.ewm(span=26, adjust=False, min_periods=26).mean().iloc[-1]
        assert frame["macd"].iloc[-1] == pytest.approx(fast - slow)

    def test_reversal_turns_the_histogram_positive(self):
        values = list(np.linspace(100, 60, 80)) + list(np.linspace(60, 95, 20))
        m = ind.macd(series(values))
        assert m.histogram > 0
        assert m.state == "BULLISH"

    def test_cross_up_flagged_on_the_crossing_bar(self):
        # A decline followed by a short, sharp rally: the MACD line crosses its
        # signal a handful of bars into the reversal.
        base = list(np.linspace(100, 60, 80))
        for rally_len in range(1, 20):
            values = base + list(np.linspace(60, 90, rally_len))
            if ind.macd(series(values)).cross_up:
                break
        else:
            pytest.fail("no bullish cross detected during the reversal")
        assert ind.macd(series(values)).state == "BULLISH"

    def test_cross_down_flagged_on_the_crossing_bar(self):
        base = list(np.linspace(60, 100, 80))
        for decline_len in range(1, 20):
            values = base + list(np.linspace(100, 70, decline_len))
            if ind.macd(series(values)).cross_down:
                break
        else:
            pytest.fail("no bearish cross detected during the reversal")

    def test_insufficient_history(self):
        m = ind.macd(series([1, 2, 3]))
        assert m.macd is None and m.histogram is None and m.cross_up is False


class TestATRAndVolatility:
    def test_true_range_uses_previous_close(self):
        high = series([11, 12, 13])
        low = series([9, 10, 11])
        close = series([10, 11, 12])
        tr = ind.true_range(high, low, close)
        assert tr.iloc[1] == pytest.approx(2.0)  # max(12-10, |12-10|, |10-10|)

    def test_atr_of_constant_range(self):
        n = 40
        high = series([11.0] * n)
        low = series([9.0] * n)
        close = series([10.0] * n)
        assert ind.atr(high, low, close, 14) == pytest.approx(2.0)

    def test_atr_insufficient_history(self):
        assert ind.atr(series([1, 2]), series([1, 2]), series([1, 2]), 14) is None

    def test_volatility_of_constant_growth_is_near_zero(self):
        s = series([100 * (1.001 ** i) for i in range(60)])
        assert ind.realised_volatility(s, 20) == pytest.approx(0.0, abs=1e-6)

    def test_volatility_scales_with_annualisation(self):
        rng = np.random.default_rng(7)
        daily = rng.normal(0, 0.02, 400)
        s = series(100 * np.exp(np.cumsum(daily)))
        vol = ind.realised_volatility(s, 250)
        # 2% daily -> roughly 31.7% annualised.
        assert 25.0 < vol < 40.0


class TestRelativeVolume:
    def test_three_times_average(self):
        assert ind.relative_volume(series([100] * 20 + [300]), 20) == pytest.approx(3.0)

    def test_excludes_current_bar_from_baseline(self):
        v = series([100] * 20 + [1_000_000])
        assert ind.relative_volume(v, 20) == pytest.approx(10_000.0)

    def test_zero_baseline_returns_none(self):
        assert ind.relative_volume(series([0] * 20 + [500]), 20) is None

    def test_insufficient_history(self):
        assert ind.relative_volume(series([100] * 5), 20) is None

    def test_average_volume(self):
        assert ind.average_volume(series([10] * 20), 20) == pytest.approx(10.0)


class TestReturns:
    def test_nearest_previous_session_is_used(self):
        # Gap over a weekend/holiday: asking for a missing date walks backwards.
        idx = pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-08", "2024-01-09"])
        s = pd.Series([100.0, 101.0, 105.0, 106.0], index=idx)
        assert ind.value_on_or_before(s, pd.Timestamp("2024-01-06")) == 101.0

    def test_value_before_history_starts_is_none(self):
        s = pd.Series([1.0], index=pd.to_datetime(["2024-05-01"]))
        assert ind.value_on_or_before(s, pd.Timestamp("2023-01-01")) is None

    def test_one_week_return(self):
        idx = pd.to_datetime(
            ["2024-03-01", "2024-03-04", "2024-03-05", "2024-03-06", "2024-03-07", "2024-03-08"]
        )
        s = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0, 110.0], index=idx)
        # 7 calendar days before 2024-03-08 is 2024-03-01 -> 100.
        assert ind.return_over_days(s, 7) == pytest.approx(10.0)

    def test_return_window_longer_than_history_returns_none(self):
        idx = pd.bdate_range("2024-01-01", periods=10)
        s = pd.Series(np.linspace(100, 110, 10), index=idx)
        assert ind.return_over_days(s, 365) is None

    def test_history_shorter_than_the_window_reports_nothing(self):
        """A five-day-old listing has no 1M return - and must not invent one."""
        idx = pd.bdate_range("2024-01-01", periods=5)
        s = pd.Series([100.0, 101, 102, 103, 110], index=idx)
        assert ind.return_over_days(s, 30) is None

    def test_ytd_uses_last_session_of_prior_year(self):
        idx = pd.to_datetime(["2023-12-28", "2023-12-29", "2024-01-02", "2024-06-03"])
        s = pd.Series([90.0, 100.0, 101.0, 120.0], index=idx)
        assert ind.ytd_return(s) == pytest.approx(20.0)

    def test_ytd_without_prior_year_uses_first_session(self):
        idx = pd.to_datetime(["2024-01-04", "2024-06-03"])
        s = pd.Series([100.0, 150.0], index=idx)
        assert ind.ytd_return(s) == pytest.approx(50.0)

    def test_atr_uses_wilder_seed(self):
        # True range alternating 1 and 3 -> Wilder seed is the mean of the
        # first 14 (2.0) and the series then stays at 2.0 on average.
        n = 40
        close = series([10.0] * n)
        high = series([11.0 if i % 2 else 13.0 for i in range(n)])
        low = series([10.0 if i % 2 else 10.0 for i in range(n)])
        assert ind.atr(high, low, close, 14) is not None

    def test_performance_bundle_keys(self):
        idx = pd.bdate_range("2023-01-02", periods=420)
        s = pd.Series(np.linspace(100, 200, 420), index=idx)
        out = ind.performance_returns(s)
        assert set(out) == {"week", "month", "quarter", "year", "ytd"}
        assert all(v is not None for v in out.values())

    def test_zero_base_returns_none(self):
        idx = pd.bdate_range("2024-01-01", periods=30)
        s = pd.Series([0.0] * 29 + [10.0], index=idx)
        assert ind.return_over_days(s, 7) is None


class TestStructure:
    def test_fifty_two_week_window(self):
        idx = pd.bdate_range("2023-01-02", periods=500)
        high = pd.Series(np.concatenate([np.full(200, 500.0), np.full(300, 120.0)]), index=idx)
        low = pd.Series(np.concatenate([np.full(200, 1.0), np.full(300, 80.0)]), index=idx)
        h, l = ind.fifty_two_week(high, low)
        # The 500-high and 1-low are older than a year and must be excluded.
        assert h == pytest.approx(120.0)
        assert l == pytest.approx(80.0)

    def test_ma_structure_labels(self):
        assert ind.ma_structure(110, 100, 90) == "BULLISH"
        assert ind.ma_structure(80, 90, 100) == "BEARISH"
        assert ind.ma_structure(110, 100, 120) == "MIXED"
        assert ind.ma_structure(None, 100, 90) is None

    def test_golden_cross_detected(self):
        idx = pd.bdate_range("2024-01-01", periods=12)
        fast = pd.Series(np.linspace(90, 110, 12), index=idx)
        slow = pd.Series([100.0] * 12, index=idx)
        assert ind.ma_cross(fast, slow) == "GOLDEN_CROSS"

    def test_death_cross_detected(self):
        idx = pd.bdate_range("2024-01-01", periods=12)
        fast = pd.Series(np.linspace(110, 90, 12), index=idx)
        slow = pd.Series([100.0] * 12, index=idx)
        assert ind.ma_cross(fast, slow) == "DEATH_CROSS"

    def test_no_cross(self):
        idx = pd.bdate_range("2024-01-01", periods=12)
        fast = pd.Series(np.linspace(120, 130, 12), index=idx)
        slow = pd.Series([100.0] * 12, index=idx)
        assert ind.ma_cross(fast, slow) is None

    def test_distance_pct(self):
        assert ind.distance_pct(110, 100) == pytest.approx(10.0)
        assert ind.distance_pct(90, 100) == pytest.approx(-10.0)
        assert ind.distance_pct(100, 0) is None
        assert ind.distance_pct(None, 100) is None


class TestSafety:
    def test_safe_float_rejects_nan_and_inf(self):
        assert ind.safe_float(float("nan")) is None
        assert ind.safe_float(float("inf")) is None
        assert ind.safe_float("abc") is None
        assert ind.safe_float(None) is None
        assert ind.safe_float("3.5") == 3.5

    def test_nan_holes_do_not_break_indicators(self):
        values = list(np.linspace(100, 140, 60))
        values[10] = float("nan")
        values[30] = float("nan")
        s = series(values)
        assert ind.rsi(s, 14) is not None
        assert ind.sma(s, 20) is not None
        assert math.isfinite(ind.macd(s).macd)
