"""Trend classification and the technical score."""

from __future__ import annotations

import pytest

from app.services.scoring import (
    SIGNAL_BUY,
    SIGNAL_NEUTRAL,
    SIGNAL_SELL,
    SIGNAL_STRONG_BUY,
    SIGNAL_STRONG_SELL,
    TREND_DOWN,
    TREND_NEUTRAL,
    TREND_STRONG_DOWN,
    TREND_STRONG_UP,
    TREND_UP,
    calculate_technical_score,
    classify_trend,
    signal_from_score,
)


class TestTrend:
    def test_strong_uptrend_needs_full_stack_and_macd(self):
        assert classify_trend(110, 105, 100, 90, 0.4) == TREND_STRONG_UP

    def test_full_stack_without_macd_confirmation_is_plain_uptrend(self):
        assert classify_trend(110, 105, 100, 90, -0.4) == TREND_UP
        assert classify_trend(110, 105, 100, 90, None) == TREND_UP

    def test_strong_downtrend(self):
        assert classify_trend(80, 85, 90, 100, -0.4) == TREND_STRONG_DOWN

    def test_full_down_stack_without_macd_is_plain_downtrend(self):
        assert classify_trend(80, 85, 90, 100, 0.4) == TREND_DOWN

    def test_above_both_long_averages_is_uptrend(self):
        # SMA20 out of order, so no full stack, but price leads both long MAs.
        assert classify_trend(110, 95, 100, 90, 0.1) == TREND_UP

    def test_below_both_long_averages_is_downtrend(self):
        assert classify_trend(80, 95, 90, 100, -0.1) == TREND_DOWN

    def test_conflicting_averages_are_neutral(self):
        assert classify_trend(95, 96, 90, 100, 0.0) == TREND_NEUTRAL

    def test_missing_price_is_unknown(self):
        assert classify_trend(None, 100, 100, 100, 1.0) is None

    def test_missing_long_average_falls_back_gracefully(self):
        assert classify_trend(110, None, 100, None, None) == TREND_NEUTRAL


class TestTechnicalScore:
    def test_maximum_bullish_configuration(self):
        result = calculate_technical_score(
            price=110, rsi=25, macd=1.0, macd_signal=0.5, macd_histogram=0.5,
            sma50=100, sma200=90, return_1m=15,
        )
        assert result.score == 10
        assert result.signal == SIGNAL_STRONG_BUY
        assert len(result.components) == 5

    def test_maximum_bearish_configuration(self):
        result = calculate_technical_score(
            price=80, rsi=85, macd=-1.0, macd_signal=-0.5, macd_histogram=-0.5,
            sma50=100, sma200=110, return_1m=-20,
        )
        assert result.score == -10
        assert result.signal == SIGNAL_STRONG_SELL

    def test_no_data_scores_zero_and_stays_neutral(self):
        result = calculate_technical_score()
        assert result.score == 0
        assert result.signal == SIGNAL_NEUTRAL
        assert all(c.points == 0 for c in result.components)

    def test_every_component_is_explained(self):
        result = calculate_technical_score(price=100, rsi=50, sma50=95, sma200=105)
        keys = {c.key for c in result.components}
        assert keys == {"rsi", "macd", "sma50", "sma200", "momentum"}
        assert all(c.detail for c in result.components)

    def test_score_is_the_sum_of_components(self):
        result = calculate_technical_score(
            price=105, rsi=62, macd=0.2, macd_signal=0.1, macd_histogram=0.1,
            sma50=100, sma200=110, return_1m=3,
        )
        assert result.score == sum(c.points for c in result.components)

    def test_oversold_rsi_scores_positive(self):
        result = calculate_technical_score(rsi=20)
        rsi_component = next(c for c in result.components if c.key == "rsi")
        assert rsi_component.points == 2

    def test_overbought_rsi_scores_negative(self):
        result = calculate_technical_score(rsi=80)
        rsi_component = next(c for c in result.components if c.key == "rsi")
        assert rsi_component.points == -2

    @pytest.mark.parametrize(
        "rsi,points",
        [(29, 2), (30, 2), (40, 1), (45, 1), (50, 0), (54.9, 0), (60, -1), (69.9, -1), (70, -2)],
    )
    def test_rsi_bands(self, rsi, points):
        result = calculate_technical_score(rsi=rsi)
        assert next(c for c in result.components if c.key == "rsi").points == points

    def test_macd_without_signal_confirmation_scores_one(self):
        result = calculate_technical_score(macd_histogram=0.5)
        assert next(c for c in result.components if c.key == "macd").points == 1

    def test_macd_with_signal_confirmation_scores_two(self):
        result = calculate_technical_score(macd=1.0, macd_signal=0.4, macd_histogram=0.6)
        assert next(c for c in result.components if c.key == "macd").points == 2

    @pytest.mark.parametrize(
        "ret,points", [(15, 2), (10, 2), (4, 1), (0, 0), (-4, -1), (-10, -2), (-25, -2)]
    )
    def test_momentum_bands(self, ret, points):
        result = calculate_technical_score(return_1m=ret)
        assert next(c for c in result.components if c.key == "momentum").points == points

    def test_partial_data_cannot_reach_an_extreme_label(self):
        """A security with only an RSI must not be labelled STRONG BUY."""
        result = calculate_technical_score(rsi=20)
        assert result.signal in {SIGNAL_NEUTRAL, SIGNAL_BUY}

    def test_payload_carries_the_disclaimer_and_inputs(self):
        payload = calculate_technical_score(rsi=20).to_dict()
        assert "not investment advice" in payload["disclaimer"].lower()
        assert payload["max_score"] == 10
        assert len(payload["components"]) == 5


class TestSignalLadder:
    @pytest.mark.parametrize(
        "score,signal",
        [
            (10, SIGNAL_STRONG_BUY),
            (6, SIGNAL_STRONG_BUY),
            (5, SIGNAL_BUY),
            (2, SIGNAL_BUY),
            (1, SIGNAL_NEUTRAL),
            (0, SIGNAL_NEUTRAL),
            (-1, SIGNAL_NEUTRAL),
            (-2, SIGNAL_SELL),
            (-5, SIGNAL_SELL),
            (-6, SIGNAL_STRONG_SELL),
            (-10, SIGNAL_STRONG_SELL),
        ],
    )
    def test_thresholds(self, score, signal):
        assert signal_from_score(score) == signal
