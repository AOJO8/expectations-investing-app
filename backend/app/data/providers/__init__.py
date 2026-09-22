"""Provider selection."""

from __future__ import annotations

import logging

from ...core.config import settings
from .base import MarketDataProvider, ProviderError
from .fixture_provider import FixtureProvider
from .yfinance_provider import YFinanceProvider

logger = logging.getLogger(__name__)

_provider: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    global _provider
    if _provider is None:
        if settings.is_fixture:
            logger.warning(
                "AYO_PROVIDER=fixture - serving SYNTHETIC data. "
                "This is not market data and is flagged as such in every response."
            )
            _provider = FixtureProvider()
        else:
            _provider = YFinanceProvider()
    return _provider


def set_provider(provider: MarketDataProvider | None) -> None:
    """Override the active provider (tests)."""
    global _provider
    _provider = provider


__all__ = [
    "MarketDataProvider",
    "ProviderError",
    "FixtureProvider",
    "YFinanceProvider",
    "get_provider",
    "set_provider",
]
