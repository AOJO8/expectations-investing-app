"""Technical indicator maths.

Pure pandas/numpy. No network, no yfinance, no caching - so every function
here is directly unit-testable against hand-built series.

Conventions
-----------
* Every function takes an ordered (oldest -> newest) ``pd.Series`` indexed by
  date and returns either a ``float | None`` scalar (the latest value) or a
  full ``pd.Series`` when the caller needs history.
* ``None`` means "not enough data", never 0. Callers must not fill it in.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

TRADING_DAYS_PER_YEAR = 252


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _clean(series: pd.Series) -> pd.Series:
    """Drop NaNs and coerce to float, preserving order."""
    if series is None or len(series) == 0:
        return pd.Series(dtype="float64")
    s = pd.to_numeric(series, errors="coerce").dropna()
    return s.astype("float64")


def _last_float(series: pd.Series) -> float | None:
    s = _clean(series)
    if s.empty:
        return None
    value = float(s.iloc[-1])
    return None if not math.isfinite(value) else value


def safe_float(value) -> float | None:
    """Convert to a finite float or ``None``. Used at every boundary."""
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def wilder_rma(values: pd.Series, period: int) -> pd.Series:
    """Wilder's running moving average (a.k.a. RMA/SMMA).

    Wilder seeds the average with the simple mean of the first ``period``
    observations and only then applies the recursive smoothing
    ``avg_t = avg_{t-1} + (x_t - avg_{t-1}) / period``. Seeding with the first
    observation instead - which is what a bare ``ewm(adjust=False)`` does -
    produces visibly different values for the first few hundred bars, so the
    seed is applied explicitly here.
    """
    x = _clean(values)
    if len(x) < period:
        return pd.Series(dtype="float64")
    seeded = x.astype("float64").copy()
    seeded.iloc[: period - 1] = np.nan
    seeded.iloc[period - 1] = float(x.iloc[:period].mean())
    return seeded.ewm(alpha=1.0 / period, adjust=False).mean()


# ---------------------------------------------------------------------------
# moving averages
# ---------------------------------------------------------------------------

def sma_series(close: pd.Series, period: int) -> pd.Series:
    s = _clean(close)
    if len(s) < period:
        return pd.Series(dtype="float64")
    return s.rolling(window=period, min_periods=period).mean()


def sma(close: pd.Series, period: int) -> float | None:
    return _last_float(sma_series(close, period))


def ema_series(close: pd.Series, period: int) -> pd.Series:
    """EMA seeded on the first ``period`` observations.

    ``adjust=False`` gives the recursive form used by charting packages:
    ema_t = alpha * price_t + (1 - alpha) * ema_{t-1}, alpha = 2/(period+1).
    """
    s = _clean(close)
    if len(s) < period:
        return pd.Series(dtype="float64")
    return s.ewm(span=period, adjust=False, min_periods=period).mean()


def ema(close: pd.Series, period: int) -> float | None:
    return _last_float(ema_series(close, period))


# ---------------------------------------------------------------------------
# RSI - Wilder's smoothing
# ---------------------------------------------------------------------------

def rsi_series(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index using Wilder's smoothing (alpha = 1/period).

    The first RSI value appears at index ``period`` and is seeded with the
    simple mean of the first ``period`` gains/losses, exactly as Wilder
    specified; subsequent values use the recursive smoothing.
    """
    s = _clean(close)
    if len(s) <= period:
        return pd.Series(dtype="float64")

    delta = s.diff().iloc[1:]
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    avg_gain = wilder_rma(gain, period)
    avg_loss = wilder_rma(loss, period)
    if avg_gain.empty or avg_loss.empty:
        return pd.Series(dtype="float64")

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    # Degenerate windows: no losses -> 100, no gains -> 0, flat -> 50.
    rsi = rsi.mask((avg_loss == 0) & (avg_gain > 0), 100.0)
    rsi = rsi.mask((avg_gain == 0) & (avg_loss > 0), 0.0)
    rsi = rsi.mask((avg_gain == 0) & (avg_loss == 0), 50.0)
    return rsi.dropna()


def rsi(close: pd.Series, period: int = 14) -> float | None:
    return _last_float(rsi_series(close, period))


def rsi_zone(value: float | None) -> str | None:
    """Bucket used for conditional formatting and the RSI tooltip."""
    if value is None:
        return None
    if value >= 70:
        return "OVERBOUGHT"
    if value >= 55:
        return "STRONG"
    if value >= 45:
        return "NEUTRAL"
    if value > 30:
        return "WEAK"
    return "OVERSOLD"


# ---------------------------------------------------------------------------
# MACD
# ---------------------------------------------------------------------------

@dataclass
class Macd:
    macd: float | None
    signal: float | None
    histogram: float | None
    #: histogram direction vs the prior bar: "RISING" | "FALLING" | "FLAT" | None
    direction: str | None
    #: "BULLISH" when macd > signal, "BEARISH" when below.
    state: str | None
    #: True on the bar where macd crossed above/below the signal line.
    cross_up: bool
    cross_down: bool

    def to_dict(self) -> dict:
        return asdict(self)


def macd_frame(
    close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
) -> pd.DataFrame:
    s = _clean(close)
    if len(s) < slow:
        return pd.DataFrame(columns=["macd", "signal", "histogram"], dtype="float64")
    fast_ema = s.ewm(span=fast, adjust=False, min_periods=fast).mean()
    slow_ema = s.ewm(span=slow, adjust=False, min_periods=slow).mean()
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame(
        {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": macd_line - signal_line,
        }
    )


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Macd:
    frame = macd_frame(close, fast, slow, signal)
    if frame.empty:
        return Macd(None, None, None, None, None, False, False)

    macd_val = safe_float(frame["macd"].iloc[-1])
    signal_val = safe_float(frame["signal"].iloc[-1])
    hist_val = safe_float(frame["histogram"].iloc[-1])

    hist_clean = frame["histogram"].dropna()
    direction = None
    if len(hist_clean) >= 2:
        delta = float(hist_clean.iloc[-1]) - float(hist_clean.iloc[-2])
        direction = "RISING" if delta > 0 else "FALLING" if delta < 0 else "FLAT"

    state = None
    if macd_val is not None and signal_val is not None:
        state = "BULLISH" if macd_val > signal_val else "BEARISH" if macd_val < signal_val else "FLAT"

    cross_up = cross_down = False
    both = frame[["macd", "signal"]].dropna()
    if len(both) >= 2:
        prev_diff = float(both["macd"].iloc[-2] - both["signal"].iloc[-2])
        curr_diff = float(both["macd"].iloc[-1] - both["signal"].iloc[-1])
        cross_up = prev_diff <= 0 < curr_diff
        cross_down = prev_diff >= 0 > curr_diff

    return Macd(macd_val, signal_val, hist_val, direction, state, cross_up, cross_down)


# ---------------------------------------------------------------------------
# ATR / volatility
# ---------------------------------------------------------------------------

def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    h, l, c = (pd.to_numeric(x, errors="coerce").astype("float64") for x in (high, low, close))
    prev_close = c.shift(1)
    ranges = pd.concat(
        [(h - l), (h - prev_close).abs(), (l - prev_close).abs()], axis=1
    )
    return ranges.max(axis=1, skipna=False)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float | None:
    """Average True Range with Wilder's smoothing."""
    tr = true_range(high, low, close).dropna()
    if len(tr) < period:
        return None
    return _last_float(wilder_rma(tr, period))


def realised_volatility(close: pd.Series, window: int = 20) -> float | None:
    """Annualised realised volatility, in percent, from log returns."""
    s = _clean(close)
    if len(s) < window + 1:
        return None
    log_returns = np.log(s / s.shift(1)).dropna()
    if len(log_returns) < window:
        return None
    daily = float(log_returns.iloc[-window:].std(ddof=1))
    if not math.isfinite(daily):
        return None
    return daily * math.sqrt(TRADING_DAYS_PER_YEAR) * 100.0


# ---------------------------------------------------------------------------
# volume
# ---------------------------------------------------------------------------

def relative_volume(volume: pd.Series, window: int = 20) -> float | None:
    """Latest volume divided by the mean of the prior ``window`` sessions.

    The current bar is excluded from the average so a huge print does not
    dilute its own signal.
    """
    v = _clean(volume)
    if len(v) < window + 1:
        return None
    latest = float(v.iloc[-1])
    baseline = float(v.iloc[-(window + 1):-1].mean())
    if baseline <= 0:
        return None
    return latest / baseline


def average_volume(volume: pd.Series, window: int = 20) -> float | None:
    v = _clean(volume)
    if len(v) < window:
        return None
    return float(v.iloc[-window:].mean())


# ---------------------------------------------------------------------------
# returns
# ---------------------------------------------------------------------------

def _as_timestamp_index(series: pd.Series) -> pd.Series:
    s = _clean(series)
    if s.empty:
        return s
    if not isinstance(s.index, pd.DatetimeIndex):
        try:
            s.index = pd.to_datetime(s.index)
        except (TypeError, ValueError):
            return s
    if getattr(s.index, "tz", None) is not None:
        s.index = s.index.tz_localize(None)
    return s.sort_index()


def value_on_or_before(series: pd.Series, when: datetime | date) -> float | None:
    """Value at the nearest trading session at or before ``when``.

    Calendar dates are never indexed naively: weekends, holidays and halts
    mean the exact date is frequently absent.
    """
    s = _as_timestamp_index(series)
    if s.empty or not isinstance(s.index, pd.DatetimeIndex):
        return None
    cutoff = pd.Timestamp(when)
    if cutoff.tzinfo is not None:
        cutoff = cutoff.tz_localize(None)
    eligible = s.loc[s.index <= cutoff]
    if eligible.empty:
        return None
    return float(eligible.iloc[-1])


def return_over_days(series: pd.Series, calendar_days: int) -> float | None:
    """Percentage return over a trailing calendar window."""
    s = _as_timestamp_index(series)
    if len(s) < 2 or not isinstance(s.index, pd.DatetimeIndex):
        return None
    latest_ts = s.index[-1]
    latest = float(s.iloc[-1])
    start_value = value_on_or_before(s.iloc[:-1], latest_ts - timedelta(days=calendar_days))
    if start_value is None:
        # The window predates the available history (recent listing). Report
        # nothing rather than a return measured over a shorter period than the
        # column claims.
        return None
    if start_value == 0:
        return None
    return (latest / start_value - 1.0) * 100.0


def ytd_return(series: pd.Series) -> float | None:
    """Return from the last session of the previous calendar year."""
    s = _as_timestamp_index(series)
    if len(s) < 2 or not isinstance(s.index, pd.DatetimeIndex):
        return None
    latest_ts = s.index[-1]
    year_start = pd.Timestamp(year=latest_ts.year, month=1, day=1)
    base = value_on_or_before(s, year_start - timedelta(days=1))
    if base is None:
        first_of_year = s.loc[s.index >= year_start]
        if first_of_year.empty:
            return None
        base = float(first_of_year.iloc[0])
    if base == 0:
        return None
    return (float(s.iloc[-1]) / base - 1.0) * 100.0


def performance_returns(series: pd.Series) -> dict[str, float | None]:
    """1W / 1M / 3M / 1Y / YTD percentage returns."""
    return {
        "week": return_over_days(series, 7),
        "month": return_over_days(series, 30),
        "quarter": return_over_days(series, 91),
        "year": return_over_days(series, 365),
        "ytd": ytd_return(series),
    }


# ---------------------------------------------------------------------------
# 52 week range / moving-average structure
# ---------------------------------------------------------------------------

def fifty_two_week(high: pd.Series, low: pd.Series) -> tuple[float | None, float | None]:
    h = _as_timestamp_index(high)
    l = _as_timestamp_index(low)
    if h.empty or l.empty:
        return None, None
    if isinstance(h.index, pd.DatetimeIndex):
        cutoff = h.index[-1] - timedelta(days=365)
        h = h.loc[h.index >= cutoff]
        l = l.loc[l.index >= cutoff]
    if h.empty or l.empty:
        return None, None
    return safe_float(h.max()), safe_float(l.min())


def ma_structure(
    price: float | None, sma50: float | None, sma200: float | None
) -> str | None:
    """BULLISH / BEARISH / MIXED stack classification."""
    if price is None or sma50 is None or sma200 is None:
        return None
    if price > sma50 and sma50 > sma200:
        return "BULLISH"
    if price < sma50 and sma50 < sma200:
        return "BEARISH"
    return "MIXED"


def ma_cross(sma50_hist: pd.Series, sma200_hist: pd.Series, lookback: int = 10) -> str | None:
    """Detect a golden/death cross of SMA50 through SMA200 within ``lookback`` bars."""
    a = _clean(sma50_hist)
    b = _clean(sma200_hist)
    joined = pd.concat([a, b], axis=1, join="inner").dropna()
    if len(joined) < 2:
        return None
    diff = joined.iloc[:, 0] - joined.iloc[:, 1]
    window = diff.iloc[-(lookback + 1):]
    if len(window) < 2:
        return None
    signs = np.sign(window.to_numpy())
    for idx in range(len(signs) - 1, 0, -1):
        if signs[idx] > 0 and signs[idx - 1] <= 0:
            return "GOLDEN_CROSS"
        if signs[idx] < 0 and signs[idx - 1] >= 0:
            return "DEATH_CROSS"
    return None


def distance_pct(price: float | None, level: float | None) -> float | None:
    """Percentage distance of ``price`` from ``level`` (positive = above)."""
    if price is None or level is None or level == 0:
        return None
    return (price / level - 1.0) * 100.0
