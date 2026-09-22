"""Provider contract.

A provider returns raw market data only - OHLCV frames and metadata dicts.
All derived analytics live in the service layer, so swapping data vendors
never touches indicator code.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import pandas as pd


class ProviderError(RuntimeError):
    """Raised when a provider call fails for a specific ticker or batch."""


@runtime_checkable
class MarketDataProvider(Protocol):
    #: Identifier surfaced to the client (e.g. "YAHOO_FINANCE", "FIXTURE").
    name: str
    #: True when the data is not real market data and must be labelled as such.
    is_synthetic: bool

    def fetch_history(
        self, tickers: list[str], period: str, interval: str
    ) -> dict[str, pd.DataFrame]:
        """OHLCV frames keyed by ticker. Missing/failed tickers are omitted."""

    def fetch_metadata(self, tickers: list[str]) -> dict[str, dict]:
        """Reference data keyed by ticker. Missing fields are simply absent."""

    def search(self, query: str, limit: int) -> list[dict]:
        """Symbol lookup. May return [] if the provider has no search."""
