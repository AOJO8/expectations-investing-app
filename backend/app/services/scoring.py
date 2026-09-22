"""Transparent, rules-based trend and technical classification.

Nothing here predicts future returns. Both classifiers are deterministic
functions of already-observed price data, and both return the exact list of
inputs that produced the label so the UI tooltip can show its working.

THIS IS NOT INVESTMENT ADVICE. "STRONG BUY" is a description of a technical
configuration, not a recommendation to transact.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TREND_STRONG_UP = "STRONG UPTREND"
TREND_UP = "UPTREND"
TREND_NEUTRAL = "NEUTRAL"
TREND_DOWN = "DOWNTREND"
TREND_STRONG_DOWN = "STRONG DOWNTREND"

SIGNAL_STRONG_BUY = "STRONG BUY"
SIGNAL_BUY = "BUY"
SIGNAL_NEUTRAL = "NEUTRAL"
SIGNAL_SELL = "SELL"
SIGNAL_STRONG_SELL = "STRONG SELL"

DISCLAIMER = (
    "Rules-based technical classification derived from past prices only. "
    "Not investment advice and not a prediction of future returns."
)


@dataclass
class ScoreComponent:
    """One scored input, carried through to the tooltip."""

    key: str
    label: str
    points: int
    detail: str

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "points": self.points,
            "detail": self.detail,
        }


@dataclass
class TechnicalScore:
    score: int
    max_score: int
    signal: str
    components: list[ScoreComponent] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "max_score": self.max_score,
            "signal": self.signal,
            "components": [c.to_dict() for c in self.components],
            "disclaimer": DISCLAIMER,
        }


def classify_trend(
    price: float | None,
    sma20: float | None,
    sma50: float | None,
    sma200: float | None,
    macd_histogram: float | None,
) -> str | None:
    """Rules:

    STRONG UPTREND    price > SMA20 > SMA50 > SMA200 and MACD histogram > 0
    STRONG DOWNTREND  price < SMA20 < SMA50 < SMA200 and MACD histogram < 0
    UPTREND           price above SMA50 and SMA200, or a full stack without
                      MACD confirmation
    DOWNTREND         the mirror image
    NEUTRAL           anything else, or insufficient data for the above
    """
    if price is None:
        return None

    stack_up = (
        sma20 is not None
        and sma50 is not None
        and sma200 is not None
        and price > sma20 > sma50 > sma200
    )
    stack_down = (
        sma20 is not None
        and sma50 is not None
        and sma200 is not None
        and price < sma20 < sma50 < sma200
    )

    if stack_up and macd_histogram is not None and macd_histogram > 0:
        return TREND_STRONG_UP
    if stack_down and macd_histogram is not None and macd_histogram < 0:
        return TREND_STRONG_DOWN
    if stack_up:
        return TREND_UP
    if stack_down:
        return TREND_DOWN

    above_50 = sma50 is not None and price > sma50
    above_200 = sma200 is not None and price > sma200
    below_50 = sma50 is not None and price < sma50
    below_200 = sma200 is not None and price < sma200

    if above_50 and above_200:
        return TREND_UP
    if below_50 and below_200:
        return TREND_DOWN
    return TREND_NEUTRAL


def calculate_technical_score(
    price: float | None = None,
    rsi: float | None = None,
    macd: float | None = None,
    macd_signal: float | None = None,
    macd_histogram: float | None = None,
    sma50: float | None = None,
    sma200: float | None = None,
    return_1m: float | None = None,
) -> TechnicalScore:
    """Score five independent technical inputs, each in [-2, +2].

    Score range is [-10, +10]. Inputs that are unavailable contribute zero
    points and are reported as such, so a thinly covered security drifts
    toward NEUTRAL rather than toward a confident label.

    Thresholds:
      RSI        <=30 +2 | <=45 +1 | <55 0 | <70 -1 | >=70 -2
                 (oversold scores positively, overbought negatively)
      MACD       histogram > 0 and macd > signal      +2
                 histogram > 0                        +1
                 histogram < 0 and macd < signal      -2
                 histogram < 0                        -1
      vs SMA50   above +2, below -2
      vs SMA200  above +2, below -2
      1M return  >= +10% +2 | > 0 +1 | <= -10% -2 | < 0 -1
    """
    components: list[ScoreComponent] = []

    # ---- RSI ------------------------------------------------------------
    if rsi is None:
        components.append(ScoreComponent("rsi", "RSI 14", 0, "No RSI (insufficient history)"))
    elif rsi <= 30:
        components.append(ScoreComponent("rsi", "RSI 14", 2, f"RSI {rsi:.1f} <= 30 (oversold)"))
    elif rsi <= 45:
        components.append(ScoreComponent("rsi", "RSI 14", 1, f"RSI {rsi:.1f} in 30-45 (soft)"))
    elif rsi < 55:
        components.append(ScoreComponent("rsi", "RSI 14", 0, f"RSI {rsi:.1f} in 45-55 (neutral)"))
    elif rsi < 70:
        components.append(ScoreComponent("rsi", "RSI 14", -1, f"RSI {rsi:.1f} in 55-70 (extended)"))
    else:
        components.append(ScoreComponent("rsi", "RSI 14", -2, f"RSI {rsi:.1f} >= 70 (overbought)"))

    # ---- MACD -----------------------------------------------------------
    if macd_histogram is None:
        components.append(ScoreComponent("macd", "MACD", 0, "No MACD (insufficient history)"))
    elif macd_histogram > 0:
        above = macd is not None and macd_signal is not None and macd > macd_signal
        points = 2 if above else 1
        detail = (
            f"Histogram +{macd_histogram:.4f}"
            + (" and MACD above signal" if above else " (signal line not confirmed)")
        )
        components.append(ScoreComponent("macd", "MACD", points, detail))
    elif macd_histogram < 0:
        below = macd is not None and macd_signal is not None and macd < macd_signal
        points = -2 if below else -1
        detail = (
            f"Histogram {macd_histogram:.4f}"
            + (" and MACD below signal" if below else " (signal line not confirmed)")
        )
        components.append(ScoreComponent("macd", "MACD", points, detail))
    else:
        components.append(ScoreComponent("macd", "MACD", 0, "Histogram flat"))

    # ---- price vs SMA50 / SMA200 ---------------------------------------
    for key, label, level in (("sma50", "Price vs SMA 50", sma50), ("sma200", "Price vs SMA 200", sma200)):
        if price is None or level is None:
            components.append(ScoreComponent(key, label, 0, f"No {label.split('vs ')[-1]}"))
        elif price > level:
            pct = (price / level - 1.0) * 100.0
            components.append(ScoreComponent(key, label, 2, f"Price {pct:+.2f}% above"))
        elif price < level:
            pct = (price / level - 1.0) * 100.0
            components.append(ScoreComponent(key, label, -2, f"Price {pct:+.2f}% below"))
        else:
            components.append(ScoreComponent(key, label, 0, "Price at the average"))

    # ---- 1 month momentum ----------------------------------------------
    if return_1m is None:
        components.append(ScoreComponent("momentum", "1M momentum", 0, "No 1M return"))
    elif return_1m >= 10:
        components.append(ScoreComponent("momentum", "1M momentum", 2, f"1M {return_1m:+.2f}%"))
    elif return_1m > 0:
        components.append(ScoreComponent("momentum", "1M momentum", 1, f"1M {return_1m:+.2f}%"))
    elif return_1m <= -10:
        components.append(ScoreComponent("momentum", "1M momentum", -2, f"1M {return_1m:+.2f}%"))
    elif return_1m < 0:
        components.append(ScoreComponent("momentum", "1M momentum", -1, f"1M {return_1m:+.2f}%"))
    else:
        components.append(ScoreComponent("momentum", "1M momentum", 0, "1M flat"))

    total = sum(c.points for c in components)
    return TechnicalScore(
        score=total,
        max_score=10,
        signal=signal_from_score(total),
        components=components,
    )


def signal_from_score(score: int) -> str:
    """Map the [-10, +10] score onto the five-state ladder."""
    if score >= 6:
        return SIGNAL_STRONG_BUY
    if score >= 2:
        return SIGNAL_BUY
    if score <= -6:
        return SIGNAL_STRONG_SELL
    if score <= -2:
        return SIGNAL_SELL
    return SIGNAL_NEUTRAL
