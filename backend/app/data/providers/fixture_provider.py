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
        rng = np.random.default_rng(_seed(ticker))
        sessions = max(5, min(int(days * 0.7), 2000))
        if interval in {"1m", "5m", "15m", "30m", "60m", "1h"}:
            index = pd.date_range(end=pd.Timestamp("2026-09-22 20:00"), periods=sessions, freq="30min")
        else:
            index = pd.bdate_range(end=pd.Timestamp("2026-09-22"), periods=sessions)

        base = 8.0 + (_seed(ticker) % 400)
        drift = ((_seed(ticker) % 21) - 10) / 20000.0
        vol = 0.008 + (_seed(ticker) % 25) / 1000.0
        shocks = rng.normal(drift, vol, sessions)
        close = base * np.exp(np.cumsum(shocks))

        spread = np.abs(rng.normal(0, vol, sessions)) * close
        open_ = close * (1 + rng.normal(0, vol / 2, sessions))
        high = np.maximum(open_, close) + spread
        low = np.minimum(open_, close) - spread
        volume = np.abs(rng.normal(4_000_000, 1_500_000, sessions)).round()

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
