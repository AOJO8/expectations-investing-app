"""Deterministic offline provider for development and tests.

THIS IS NOT MARKET DATA. It exists so the UI and the API can be exercised in
environments with no access to Yahoo Finance (CI, an offline laptop, a
sandbox behind an egress policy). It is never selected by default: it is only
used when ``AYO_PROVIDER=fixture`` is set explicitly, and everything it
produces is flagged ``data_source=FIXTURE`` all the way to a red banner in
the UI so it cannot be mistaken for real prices.
"""

from __future__ import annotations

import hashlib
from functools import lru_cache

import numpy as np
import pandas as pd

from ..instruments import INSTRUMENTS_BY_TICKER

_PERIOD_DAYS = {
    "1d": 1,
    "5d": 5,
    "1mo": 31,
    "3mo": 92,
    "6mo": 183,
    "ytd": 300,
    "1y": 365,
    "2y": 730,
    "5y": 1825,
    "10y": 3650,
    "max": 3650,
}

_SECTORS = [
    ("Technology", "Semiconductors"),
    ("Healthcare", "Biotechnology"),
    ("Energy", "Utilities - Renewable"),
    ("Industrials", "Aerospace & Defense"),
    ("Financial Services", "Capital Markets"),
    ("Consumer Cyclical", "Auto Manufacturers"),
]


def _seed(ticker: str) -> int:
    return int(hashlib.sha256(ticker.encode()).hexdigest()[:8], 16)


def _ohlcv_from_close(
    close: np.ndarray, index: pd.DatetimeIndex, rng: np.random.Generator, vol: float
) -> pd.DataFrame:
    n = len(close)
    spread = np.abs(rng.normal(0, vol, n)) * close
    open_ = close * (1 + rng.normal(0, vol / 2, n))
    high = np.maximum(open_, close) + spread
    low = np.minimum(open_, close) - spread
    volume = np.abs(rng.normal(4_000_000, 1_500_000, n)).round()
    return pd.DataFrame(
        {
            "Open": open_,
            "High": high,
            "Low": low,
            "Close": close,
            "Adj Close": close,
            "Volume": volume,
        },
        index=index,
    )


@lru_cache(maxsize=512)
def _daily_master(ticker: str) -> pd.DataFrame:
    """2000 business days of deterministic daily bars for one ticker."""
    sessions = 2000
    seed = _seed(ticker)
    rng = np.random.default_rng(seed)
    base = 8.0 + (seed % 400)
    drift = ((seed % 21) - 10) / 20000.0
    vol = 0.008 + (seed % 25) / 1000.0
    walk = np.exp(np.cumsum(rng.normal(drift, vol, sessions)))
    # Anchor the *latest* close to the base level so eight years of compounding
    # cannot drift a fixture price into four figures.
    close = base * walk / walk[-1]
    index = pd.bdate_range(end=pd.Timestamp("2026-09-22"), periods=sessions)
    return _ohlcv_from_close(close, index, rng, vol)


class FixtureProvider:
    name = "FIXTURE"
    is_synthetic = True
    is_delayed = False

    #: Symbols the fixture deliberately refuses, to exercise the failure paths.
    UNRESOLVABLE = {"CBRS", "LBPH", "NKLA", "INSILICO", "AQRTX", "ARKVX"}

    def fetch_history(
        self, tickers: list[str], period: str = "1y", interval: str = "1d"
    ) -> dict[str, pd.DataFrame]:
        days = _PERIOD_DAYS.get(period, 365)
        out: dict[str, pd.DataFrame] = {}
        for ticker in dict.fromkeys(tickers):
            if ticker in self.UNRESOLVABLE:
                continue
            out[ticker] = self._series(ticker, days, interval)
        return out

    def _series(self, ticker: str, days: int, interval: str) -> pd.DataFrame:
        """A window onto one master series per ticker.

        Every period is a *tail slice* of the same walk, so the last close a
        caller sees is identical whether it asked for 1 month or 5 years -
        exactly as a real vendor behaves. Generating a fresh walk per request
        would make the quote and the chart disagree.
        """
        if interval in {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}:
            return self._intraday(ticker, days, interval)
        master = _daily_master(ticker)
        sessions = max(5, min(int(days * 0.7), len(master)))
        return master.iloc[-sessions:].copy()

    def _intraday(self, ticker: str, days: int, interval: str) -> pd.DataFrame:
        """Intraday bars that converge on the daily series' latest close."""
        master = _daily_master(ticker)
        anchor = float(master["Close"].iloc[-1])
        minutes = {"1m": 1, "2m": 2, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "90m": 90, "1h": 60}[interval]
        bars = max(10, min(int(days * 390 / minutes), 800))

        rng = np.random.default_rng(_seed(ticker) + minutes)
        vol = 0.0015 + (_seed(ticker) % 12) / 8000.0
        shocks = rng.normal(0, vol, bars)
        walk = np.exp(np.cumsum(shocks))
        close = anchor * walk / walk[-1]  # end exactly on the daily close

        index = pd.date_range(
            end=pd.Timestamp("2026-09-22 20:00"), periods=bars, freq=f"{minutes}min"
        )
        return _ohlcv_from_close(close, index, rng, vol)

    def fetch_metadata(self, tickers: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for ticker in dict.fromkeys(tickers):
            if ticker in self.UNRESOLVABLE:
                continue
            seed = _seed(ticker)
            rng = np.random.default_rng(seed)
            inst = INSTRUMENTS_BY_TICKER.get(ticker)
            sector, industry = _SECTORS[seed % len(_SECTORS)]
            payload: dict = {
                "name": inst.name if inst else ticker,
                "currency": (inst.currency_hint if inst else None) or "USD",
                "market_cap": float(rng.integers(3e8, 3e12)),
                "beta": round(float(rng.normal(1.2, 0.5)), 3),
                "average_volume": float(rng.integers(500_000, 60_000_000)),
                "exchange_name": "FIXTURE EXCHANGE",
                "quote_type": inst.asset_class if inst else "EQUITY",
            }
            if not inst or inst.asset_class == "EQUITY":
                payload.update(
                    {
                        "sector": sector,
                        "industry": industry,
                        "trailing_pe": round(float(rng.uniform(8, 60)), 2),
                        "forward_pe": round(float(rng.uniform(8, 45)), 2),
                        "price_to_book": round(float(rng.uniform(0.8, 18)), 2),
                        "dividend_yield": round(float(rng.uniform(0, 0.05)), 4),
                    }
                )
            out[ticker] = payload
        return out

    def search(self, query: str, limit: int = 15) -> list[dict]:
        return []

    def validate(self, ticker: str) -> dict | None:
        if ticker in self.UNRESOLVABLE:
            return None
        return {
            "ticker": ticker,
            "name": ticker,
            "asset_class": "EQUITY",
            "exchange": "FIXTURE EXCHANGE",
            "currency": "USD",
            "source": "FIXTURE",
        }
