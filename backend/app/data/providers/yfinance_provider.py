"""Yahoo Finance provider.

The ONLY module in the codebase that imports yfinance. Two rules govern
everything here:

1. A failure for one ticker must never take down a batch. Every per-ticker
   step is individually guarded and simply omits the ticker on failure; the
   service layer then marks it UNAVAILABLE.
2. Nothing is invented. If Yahoo does not return a field, it is absent -
   never defaulted to zero.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd

from ...core.circuit import provider_breaker
from ...core.config import settings
from .base import ProviderError

logger = logging.getLogger(__name__)

# Periods short enough that yfinance's batch download is worth the round trip.
_OHLCV_COLUMNS = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]


class YFinanceProvider:
    name = "YAHOO_FINANCE"
    is_synthetic = False
    #: Yahoo's equity quotes are delayed (typically 15 minutes; venue dependent).
    is_delayed = True

    def __init__(self, batch_size: int = 40) -> None:
        self.batch_size = batch_size

    # ------------------------------------------------------------------ history
    def fetch_history(
        self, tickers: list[str], period: str = "1y", interval: str = "1d"
    ) -> dict[str, pd.DataFrame]:
        import yfinance as yf

        tickers = [t for t in dict.fromkeys(tickers) if t]
        if not tickers:
            return {}

        provider_breaker.check()

        out: dict[str, pd.DataFrame] = {}
        for start in range(0, len(tickers), self.batch_size):
            chunk = tickers[start : start + self.batch_size]
            try:
                raw = yf.download(
                    tickers=chunk,
                    period=period,
                    interval=interval,
                    auto_adjust=False,
                    actions=False,
                    group_by="ticker",
                    threads=True,
                    progress=False,
                    repair=False,
                )
            except Exception as exc:  # network/parse failure for the whole chunk
                logger.warning("yfinance batch failed (%s): %s", chunk[:3], exc)
                provider_breaker.record_failure()
                provider_breaker.check()
                continue

            resolved = self._split_batch(raw, chunk)
            out.update(resolved)

            if resolved:
                provider_breaker.record_success()
                # Only the stragglers are worth an individual retry: the batch
                # clearly reached Yahoo, so a gap is symbol-specific.
                missing = [t for t in chunk if t not in resolved]
                if missing:
                    out.update(self._fetch_history_individually(missing, period, interval))
            else:
                # Nothing at all came back. Retrying each symbol one by one here
                # multiplies a connectivity failure by the size of the universe,
                # so the whole chunk is reported unavailable instead.
                logger.warning("yfinance returned no data for a batch of %s symbols", len(chunk))
                provider_breaker.record_failure()
                provider_breaker.check()

        return out

    def _split_batch(self, raw: pd.DataFrame, chunk: list[str]) -> dict[str, pd.DataFrame]:
        out: dict[str, pd.DataFrame] = {}
        if raw is None or raw.empty:
            return out
        multi = isinstance(raw.columns, pd.MultiIndex)
        for ticker in chunk:
            try:
                if multi:
                    if ticker not in raw.columns.get_level_values(0):
                        continue
                    frame = raw[ticker]
                else:
                    frame = raw
                frame = self._normalise(frame)
                if frame is not None and not frame.empty:
                    out[ticker] = frame
            except Exception as exc:
                logger.debug("could not extract %s from batch: %s", ticker, exc)
        return out

    def _fetch_history_individually(
        self, tickers: list[str], period: str, interval: str
    ) -> dict[str, pd.DataFrame]:
        import yfinance as yf

        out: dict[str, pd.DataFrame] = {}

        def one(ticker: str) -> tuple[str, pd.DataFrame | None]:
            try:
                frame = yf.Ticker(ticker).history(
                    period=period, interval=interval, auto_adjust=False, actions=False
                )
                return ticker, self._normalise(frame)
            except Exception as exc:
                logger.info("history unavailable for %s: %s", ticker, exc)
                return ticker, None

        workers = min(settings.metadata_workers, max(1, len(tickers)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for future in as_completed([pool.submit(one, t) for t in tickers]):
                ticker, frame = future.result()
                if frame is not None and not frame.empty:
                    out[ticker] = frame
        return out

    @staticmethod
    def _normalise(frame: pd.DataFrame | None) -> pd.DataFrame | None:
        if frame is None or not isinstance(frame, pd.DataFrame) or frame.empty:
            return None
        frame = frame.copy()
        if isinstance(frame.columns, pd.MultiIndex):
            frame.columns = frame.columns.get_level_values(-1)
        # Keep only the OHLCV columns we understand, preserving what exists.
        keep = [c for c in _OHLCV_COLUMNS if c in frame.columns]
        if "Close" not in keep:
            return None
        frame = frame[keep]
        if "Adj Close" not in frame.columns:
            frame["Adj Close"] = frame["Close"]
        if "Volume" not in frame.columns:
            frame["Volume"] = pd.NA
        frame = frame.dropna(subset=["Close"], how="all")
        if frame.empty:
            return None
        try:
            frame.index = pd.to_datetime(frame.index)
            if getattr(frame.index, "tz", None) is not None:
                frame.index = frame.index.tz_convert(None)
        except (TypeError, ValueError):
            pass
        return frame.sort_index()

    # ----------------------------------------------------------------- metadata
    def fetch_metadata(self, tickers: list[str]) -> dict[str, dict]:
        import yfinance as yf

        tickers = [t for t in dict.fromkeys(tickers) if t]
        if not tickers:
            return {}

        def one(ticker: str) -> tuple[str, dict]:
            payload: dict = {}
            handle = yf.Ticker(ticker)
            # fast_info is cheap and usually enough for the worksheet.
            try:
                fast = handle.fast_info
                for src, dest in (
                    ("currency", "currency"),
                    ("market_cap", "market_cap"),
                    ("shares", "shares_outstanding"),
                    ("exchange", "exchange"),
                    ("quote_type", "quote_type"),
                    ("timezone", "timezone"),
                    ("year_high", "fifty_two_week_high"),
                    ("year_low", "fifty_two_week_low"),
                    ("three_year_average_return", "three_year_average_return"),
                ):
                    try:
                        value = fast[src] if hasattr(fast, "__getitem__") else getattr(fast, src, None)
                    except Exception:
                        value = None
                    if value is not None:
                        payload[dest] = value
            except Exception as exc:
                logger.debug("fast_info unavailable for %s: %s", ticker, exc)

            # .info carries the fundamentals; it is slower and may 404.
            try:
                info = handle.info or {}
            except Exception as exc:
                logger.debug("info unavailable for %s: %s", ticker, exc)
                info = {}

            for src, dest in (
                ("longName", "name"),
                ("shortName", "short_name"),
                ("currency", "currency"),
                ("marketCap", "market_cap"),
                ("sector", "sector"),
                ("industry", "industry"),
                ("beta", "beta"),
                ("trailingPE", "trailing_pe"),
                ("forwardPE", "forward_pe"),
                ("priceToBook", "price_to_book"),
                ("averageVolume", "average_volume"),
                ("fiftyTwoWeekHigh", "fifty_two_week_high"),
                ("fiftyTwoWeekLow", "fifty_two_week_low"),
                ("exchange", "exchange"),
                ("fullExchangeName", "exchange_name"),
                ("quoteType", "quote_type"),
            ):
                value = info.get(src)
                if value is not None:
                    payload[dest] = value

            dividend_yield = self._dividend_yield(info)
            if dividend_yield is not None:
                payload["dividend_yield"] = dividend_yield
            return ticker, payload

        provider_breaker.check()

        out: dict[str, dict] = {}
        workers = min(settings.metadata_workers, max(1, len(tickers)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(one, t) for t in tickers]
            for future in as_completed(futures):
                try:
                    ticker, payload = future.result()
                except Exception as exc:
                    logger.debug("metadata task failed: %s", exc)
                    continue
                if payload:
                    out[ticker] = payload

        if out:
            provider_breaker.record_success()
        elif tickers:
            provider_breaker.record_failure()
        return out

    @staticmethod
    def _dividend_yield(info: dict) -> float | None:
        """Return the dividend yield as a fraction (0.0043 == 0.43%).

        Yahoo's ``dividendYield`` has been served both as a fraction and as a
        percentage depending on the yfinance release, and 0.43 is ambiguous
        between 0.43% and 43%. ``trailingAnnualDividendYield`` is consistently
        a fraction, so it is preferred; the fallback only rescales values that
        are unambiguously percentages (> 1, i.e. above 100% as a fraction).
        """
        trailing = info.get("trailingAnnualDividendYield")
        if isinstance(trailing, (int, float)) and trailing >= 0:
            return float(trailing)

        raw = info.get("dividendYield")
        if not isinstance(raw, (int, float)) or raw < 0:
            return None
        return float(raw) / 100.0 if raw > 1 else float(raw)

    # ------------------------------------------------------------------- search
    def search(self, query: str, limit: int = 15) -> list[dict]:
        """Yahoo's symbol search. Returns [] rather than raising on failure."""
        try:
            import yfinance as yf

            search_cls = getattr(yf, "Search", None)
            if search_cls is None:
                return []
            result = search_cls(query, max_results=limit, news_count=0)
            quotes = getattr(result, "quotes", None) or []
        except Exception as exc:
            logger.info("yahoo search failed for %r: %s", query, exc)
            return []

        out: list[dict] = []
        for q in quotes[:limit]:
            symbol = q.get("symbol")
            if not symbol:
                continue
            out.append(
                {
                    "ticker": symbol,
                    "name": q.get("longname") or q.get("shortname") or symbol,
                    "exchange": q.get("exchDisp") or q.get("exchange"),
                    "asset_class": (q.get("quoteType") or "EQUITY").upper(),
                    "source": "YAHOO_SEARCH",
                }
            )
        return out

    def validate(self, ticker: str) -> dict | None:
        """Confirm a symbol resolves; used when the user adds a ticker by hand."""
        frames = self.fetch_history([ticker], period="1mo", interval="1d")
        if ticker not in frames:
            return None
        meta = self.fetch_metadata([ticker]).get(ticker, {})
        return {
            "ticker": ticker,
            "name": meta.get("name") or meta.get("short_name") or ticker,
            "asset_class": (meta.get("quote_type") or "EQUITY").upper(),
            "exchange": meta.get("exchange_name") or meta.get("exchange"),
            "currency": meta.get("currency"),
            "source": "YAHOO_VALIDATED",
        }
