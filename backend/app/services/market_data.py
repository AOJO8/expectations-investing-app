"""MarketDataService - the single orchestration point for market data.

Routes never import a provider and never see a DataFrame. This service:

* pulls raw OHLCV / metadata from the active provider,
* derives quotes, returns and technicals via the pure indicator module,
* caches at every layer with explicit TTLs and stale-serve,
* and isolates failure per instrument so one bad symbol cannot break a batch.

Status vocabulary (per instrument, never fatal to the request):
    OK           fresh data from the provider
    DELAYED      fresh, but the venue/provider feed is delayed (Yahoo equities)
    STALE        served from cache after a failed refresh
    UNAVAILABLE  provider returned nothing for this symbol
    DELISTED     no data and the instrument is flagged as delisted/historical
    NO_HISTORY   a quote exists but there is too little history for technicals
    ERROR        an unexpected failure while deriving this instrument's row
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable

import pandas as pd

from ..core.cache import cache
from ..core.circuit import CircuitOpen, provider_breaker
from ..core.config import settings
from ..core import db
from ..data.instruments import (
    DEFAULT_INSTRUMENTS,
    GROUP_ORDER,
    INSTRUMENTS_BY_TICKER,
    Instrument,
    MARKET_STRIP_TICKERS,
    WATCHLIST,
    search_default_universe,
)
from ..data.providers import get_provider
from . import indicators as ind
from .scoring import calculate_technical_score, classify_trend

logger = logging.getLogger(__name__)

STATUS_OK = "OK"
STATUS_DELAYED = "DELAYED"
STATUS_STALE = "STALE"
STATUS_UNAVAILABLE = "UNAVAILABLE"
STATUS_DELISTED = "DELISTED"
STATUS_NO_HISTORY = "NO_HISTORY"
STATUS_ERROR = "ERROR"

#: Instruments known to have stopped trading; their absence is expected.
_DELISTED_HINTS = {"LBPH", "NKLA"}

QUOTE_PERIOD = "1mo"
TECHNICAL_PERIOD = "2y"
SPARKLINE_SESSIONS = 30


@dataclass
class Row:
    """One worksheet row: quote + technicals + provenance."""

    data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return self.data


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _f(value: Any) -> float | None:
    return ind.safe_float(value)


class MarketDataService:
    def __init__(self) -> None:
        self._hydration_lock = threading.Lock()
        self._hydrating: set[str] = set()

    # ------------------------------------------------------------------ universe
    def instruments(self) -> list[Instrument]:
        """Built-in universe plus user-added securities, with overrides applied."""
        instruments = list(DEFAULT_INSTRUMENTS)
        try:
            rows = db.query("SELECT * FROM user_instruments ORDER BY created_at")
            overrides = {
                r["ticker"]: r for r in db.query("SELECT * FROM instrument_overrides")
            }
        except Exception as exc:
            logger.warning("could not read user instruments: %s", exc)
            rows, overrides = [], {}

        known = {i.ticker for i in instruments}
        for r in rows:
            if r["ticker"] in known:
                continue
            instruments.append(
                Instrument(
                    ticker=r["ticker"],
                    name=r["name"] or r["ticker"],
                    groups=(r["group_name"],),
                    asset_class=r["asset_class"],
                    region=r["region"],
                )
            )

        if overrides:
            adjusted: list[Instrument] = []
            for inst in instruments:
                ov = overrides.get(inst.ticker)
                if ov and ov["hidden"]:
                    continue
                if ov and ov["group_name"]:
                    inst = Instrument(**{**inst.__dict__, "groups": (ov["group_name"],)})
                adjusted.append(inst)
            instruments = adjusted

        return instruments

    def favourites(self) -> set[str]:
        try:
            return {r["ticker"] for r in db.query("SELECT ticker FROM favourites")}
        except Exception:
            return set()

    def watchlist_tickers(self) -> list[str]:
        try:
            rows = db.query(
                """
                SELECT m.ticker FROM watchlist_members m
                JOIN watchlists w ON w.id = m.watchlist_id
                WHERE w.is_default = 1
                ORDER BY m.position, m.added_at
                """
            )
            return [r["ticker"] for r in rows]
        except Exception:
            return []

    def group_layout(self) -> list[dict[str, Any]]:
        """Section order, including any user-defined groups."""
        instruments = self.instruments()
        present = {g for i in instruments for g in i.groups}
        ordered = [g for g in GROUP_ORDER if g in present or g == WATCHLIST]
        extra = sorted(present - set(GROUP_ORDER))
        try:
            positions = {r["group_name"]: r["position"] for r in db.query("SELECT * FROM group_order")}
        except Exception:
            positions = {}
        groups = ordered + extra
        if positions:
            groups.sort(key=lambda g: positions.get(g, GROUP_ORDER.index(g) if g in GROUP_ORDER else 999))
        return [{"name": g, "position": idx} for idx, g in enumerate(groups)]

    # ------------------------------------------------------------------- history
    def get_history(
        self, ticker: str, period: str = "1y", interval: str = "1d", allow_stale: bool = True
    ) -> tuple[pd.DataFrame | None, bool]:
        """Cached OHLCV for one ticker. Returns ``(frame, is_stale)``."""
        inst = INSTRUMENTS_BY_TICKER.get(ticker)
        if inst is not None and inst.synthetic:
            return None, False

        key = f"history:{ticker}:{period}:{interval}"
        ttl = self._history_ttl(period)
        try:
            frame, stale, _age = cache.get_or_compute(
                key,
                ttl,
                lambda: get_provider().fetch_history([ticker], period=period, interval=interval).get(ticker),
                max_stale=settings.max_stale_seconds if allow_stale else 0,
            )
        except CircuitOpen:
            logger.info("provider circuit open - no history for %s", ticker)
            return None, False
        except Exception as exc:
            logger.info("history failed for %s: %s", ticker, exc)
            return None, False
        return frame, stale

    @staticmethod
    def _history_ttl(period: str) -> int:
        if period in {"1d", "5d", "1mo"}:
            return settings.ttl_history_recent
        return settings.ttl_history_long

    def _batch_history(
        self, tickers: list[str], period: str, interval: str = "1d"
    ) -> tuple[dict[str, pd.DataFrame], set[str]]:
        """Fetch many tickers, using cache per ticker and batching the misses.

        Returns ``(frames, stale_tickers)``.
        """
        frames: dict[str, pd.DataFrame] = {}
        stale: set[str] = set()
        misses: list[str] = []

        for ticker in tickers:
            key = f"history:{ticker}:{period}:{interval}"
            entry = cache.get_entry(key)
            if entry is not None and entry.is_fresh:
                if entry.value is not None:
                    frames[ticker] = entry.value
                continue
            misses.append(ticker)

        if misses:
            try:
                fetched = get_provider().fetch_history(misses, period=period, interval=interval)
            except CircuitOpen:
                logger.info("provider circuit open - skipping history fetch for %s symbols", len(misses))
                fetched = {}
            except Exception as exc:
                logger.warning("batch history failed entirely: %s", exc)
                fetched = {}

            ttl = self._history_ttl(period)
            for ticker in misses:
                frame = fetched.get(ticker)
                key = f"history:{ticker}:{period}:{interval}"
                if frame is not None and not frame.empty:
                    cache.set(key, frame, ttl)
                    frames[ticker] = frame
                    continue
                # Refresh failed - fall back to a stale entry if we have one.
                entry = cache.get_entry(key)
                if entry is not None and entry.value is not None and entry.age <= settings.max_stale_seconds:
                    frames[ticker] = entry.value
                    stale.add(ticker)
                else:
                    cache.set(key, None, min(ttl, 60))
        return frames, stale

    # ------------------------------------------------------------------ metadata
    def get_metadata(self, tickers: list[str]) -> dict[str, dict]:
        """Reference data, cached in memory for the TTL and in SQLite across restarts."""
        wanted = [t for t in dict.fromkeys(tickers) if t]
        out: dict[str, dict] = {}
        misses: list[str] = []

        for ticker in wanted:
            entry = cache.get_entry(f"meta:{ticker}")
            if entry is not None and entry.is_fresh:
                if entry.value:
                    out[ticker] = entry.value
                continue
            persisted = self._metadata_from_db(ticker)
            if persisted is not None:
                out[ticker] = persisted
                cache.set(f"meta:{ticker}", persisted, settings.ttl_metadata)
                continue
            misses.append(ticker)

        if misses:
            try:
                fetched = get_provider().fetch_metadata(misses)
            except CircuitOpen:
                logger.info("provider circuit open - skipping metadata for %s symbols", len(misses))
                fetched = {}
            except Exception as exc:
                logger.warning("metadata batch failed: %s", exc)
                fetched = {}
            for ticker in misses:
                payload = fetched.get(ticker) or {}
                if payload:
                    cache.set(f"meta:{ticker}", payload, settings.ttl_metadata)
                    out[ticker] = payload
                    self._metadata_to_db(ticker, payload)
                else:
                    # Short TTL on a blank so a recovered provider is retried
                    # soon rather than a day later.
                    cache.set(f"meta:{ticker}", {}, min(settings.ttl_metadata, 300))
        return out

    def _metadata_from_db(self, ticker: str) -> dict | None:
        try:
            rows = db.query("SELECT payload, fetched_at FROM metadata_cache WHERE ticker = ?", (ticker,))
        except Exception:
            return None
        if not rows:
            return None
        if time.time() - float(rows[0]["fetched_at"]) > settings.ttl_metadata:
            return None
        try:
            return json.loads(rows[0]["payload"])
        except (TypeError, ValueError):
            return None

    def _metadata_to_db(self, ticker: str, payload: dict) -> None:
        try:
            db.execute(
                "INSERT INTO metadata_cache (ticker, payload, fetched_at) VALUES (?, ?, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at",
                (ticker, json.dumps(payload), time.time()),
            )
        except Exception as exc:
            logger.debug("could not persist metadata for %s: %s", ticker, exc)

    # -------------------------------------------------------------------- quotes
    def get_quote(self, ticker: str) -> dict[str, Any]:
        rows = self.get_quotes([ticker])
        return rows[0] if rows else self._empty_row(ticker, STATUS_UNAVAILABLE)

    def get_quotes(self, tickers: list[str]) -> list[dict[str, Any]]:
        """Fast snapshot: last/change/OHLC/volume only, no long history."""
        wanted = [t for t in dict.fromkeys(tickers) if t]
        fetchable = [t for t in wanted if not self._is_synthetic(t)]
        frames, stale = self._batch_history(fetchable, QUOTE_PERIOD, "1d")
        metadata = self.get_metadata(fetchable)

        rows: list[dict[str, Any]] = []
        for ticker in wanted:
            try:
                rows.append(self._build_quote_row(ticker, frames.get(ticker), metadata.get(ticker, {}), ticker in stale))
            except Exception as exc:
                logger.exception("quote row failed for %s: %s", ticker, exc)
                rows.append(self._empty_row(ticker, STATUS_ERROR, str(exc)))
        return rows

    def _is_synthetic(self, ticker: str) -> bool:
        inst = INSTRUMENTS_BY_TICKER.get(ticker)
        return bool(inst and inst.synthetic)

    def _empty_row(self, ticker: str, status: str, message: str | None = None) -> dict[str, Any]:
        inst = INSTRUMENTS_BY_TICKER.get(ticker)
        provider = get_provider()
        return {
            "ticker": ticker,
            "name": inst.name if inst else ticker,
            "asset_class": inst.asset_class if inst else "EQUITY",
            "region": inst.region if inst else None,
            "groups": list(inst.groups) if inst else [],
            "tags": list(inst.tags) if inst else [],
            "currency": inst.currency_hint if inst else None,
            "status": status,
            "status_message": message or (inst.note if inst else None),
            "data_source": provider.name,
            "is_synthetic_source": provider.is_synthetic,
            "updated_at": _utc_now_iso(),
            "last": None,
            "change": None,
            "change_pct": None,
            "technicals_loaded": False,
        }

    def _build_quote_row(
        self, ticker: str, frame: pd.DataFrame | None, meta: dict, is_stale: bool
    ) -> dict[str, Any]:
        inst = INSTRUMENTS_BY_TICKER.get(ticker)
        if inst is not None and inst.synthetic:
            row = self._empty_row(ticker, STATUS_UNAVAILABLE)
            row["status_message"] = inst.note or "No Yahoo Finance symbol."
            return row

        if frame is None or frame.empty:
            status = STATUS_DELISTED if ticker in _DELISTED_HINTS else STATUS_UNAVAILABLE
            row = self._empty_row(ticker, status)
            row["status_message"] = row["status_message"] or "No price data returned by the provider."
            return row

        row = self._empty_row(ticker, STATUS_OK)
        close = frame["Close"]
        last = _f(close.iloc[-1])
        prev_close = _f(close.iloc[-2]) if len(close) >= 2 else None
        change = last - prev_close if last is not None and prev_close is not None else None
        change_pct = (change / prev_close * 100.0) if change is not None and prev_close else None

        volume = _f(frame["Volume"].iloc[-1]) if "Volume" in frame else None
        provider = get_provider()
        status = STATUS_STALE if is_stale else (
            STATUS_DELAYED if getattr(provider, "is_delayed", False) else STATUS_OK
        )

        row.update(
            {
                "status": status,
                "status_message": "Served from cache after a failed refresh." if is_stale else None,
                "last": last,
                "previous_close": prev_close,
                "change": change,
                "change_pct": change_pct,
                "open": _f(frame["Open"].iloc[-1]) if "Open" in frame else None,
                "day_high": _f(frame["High"].iloc[-1]) if "High" in frame else None,
                "day_low": _f(frame["Low"].iloc[-1]) if "Low" in frame else None,
                "volume": volume,
                "currency": meta.get("currency") or (inst.currency_hint if inst else None),
                "market_cap": _f(meta.get("market_cap")),
                "average_volume": _f(meta.get("average_volume")),
                "beta": _f(meta.get("beta")),
                "trailing_pe": _f(meta.get("trailing_pe")),
                "forward_pe": _f(meta.get("forward_pe")),
                "price_to_book": _f(meta.get("price_to_book")),
                "dividend_yield": _f(meta.get("dividend_yield")),
                "sector": meta.get("sector"),
                "industry": meta.get("industry"),
                "exchange": meta.get("exchange_name") or meta.get("exchange"),
                "session_date": frame.index[-1].isoformat() if len(frame.index) else None,
            }
        )
        if meta.get("name") and (inst is None or inst.name == ticker):
            row["name"] = meta["name"]
        return row

    # ---------------------------------------------------------------- technicals
    def get_technicals(self, ticker: str) -> dict[str, Any]:
        """Full technical payload for one ticker (cached)."""
        key = f"technicals:{ticker}"
        entry = cache.get_entry(key)
        if entry is not None and entry.is_fresh:
            return entry.value

        frame, stale = self.get_history(ticker, period=TECHNICAL_PERIOD, interval="1d")
        payload = self._derive_technicals(ticker, frame)
        payload["stale"] = stale
        cache.set(key, payload, settings.ttl_technicals)
        return payload

    def _derive_technicals(self, ticker: str, frame: pd.DataFrame | None) -> dict[str, Any]:
        if frame is None or frame.empty or len(frame) < 2:
            return {"ticker": ticker, "status": STATUS_NO_HISTORY, "sessions": 0}

        close = frame["Close"]
        adj_close = frame["Adj Close"] if "Adj Close" in frame else close
        high = frame["High"] if "High" in frame else close
        low = frame["Low"] if "Low" in frame else close
        volume = frame["Volume"] if "Volume" in frame else pd.Series(dtype="float64")

        price = _f(close.iloc[-1])
        sma20 = ind.sma(close, 20)
        sma50 = ind.sma(close, 50)
        sma200 = ind.sma(close, 200)
        ema20 = ind.ema(close, 20)
        ema50 = ind.ema(close, 50)
        macd = ind.macd(close)
        rsi_value = ind.rsi(close, 14)
        returns = ind.performance_returns(adj_close)
        high_52w, low_52w = ind.fifty_two_week(high, low)
        structure = ind.ma_structure(price, sma50, sma200)
        cross = ind.ma_cross(ind.sma_series(close, 50), ind.sma_series(close, 200))
        trend = classify_trend(price, sma20, sma50, sma200, macd.histogram)
        score = calculate_technical_score(
            price=price,
            rsi=rsi_value,
            macd=macd.macd,
            macd_signal=macd.signal,
            macd_histogram=macd.histogram,
            sma50=sma50,
            sma200=sma200,
            return_1m=returns.get("month"),
        )

        spark = [
            v for v in (ind.safe_float(x) for x in close.iloc[-SPARKLINE_SESSIONS:].tolist())
            if v is not None
        ]

        return {
            "ticker": ticker,
            "status": STATUS_OK,
            "sessions": int(len(frame)),
            "rsi14": rsi_value,
            "rsi_zone": ind.rsi_zone(rsi_value),
            "macd": macd.macd,
            "macd_signal": macd.signal,
            "macd_histogram": macd.histogram,
            "macd_direction": macd.direction,
            "macd_state": macd.state,
            "macd_cross_up": macd.cross_up,
            "macd_cross_down": macd.cross_down,
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "ema20": ema20,
            "ema50": ema50,
            "sma50_distance_pct": ind.distance_pct(price, sma50),
            "sma200_distance_pct": ind.distance_pct(price, sma200),
            "above_sma50": None if price is None or sma50 is None else price > sma50,
            "above_sma200": None if price is None or sma200 is None else price > sma200,
            "ma_structure": structure,
            "ma_cross": cross,
            "trend": trend,
            "atr14": ind.atr(high, low, close, 14),
            "volatility_20d": ind.realised_volatility(close, 20),
            "relative_volume": ind.relative_volume(volume, 20),
            "average_volume_20d": ind.average_volume(volume, 20),
            "return_1w": returns.get("week"),
            "return_1m": returns.get("month"),
            "return_3m": returns.get("quarter"),
            "return_1y": returns.get("year"),
            "return_ytd": returns.get("ytd"),
            "high_52w": high_52w,
            "low_52w": low_52w,
            "from_52w_high_pct": ind.distance_pct(price, high_52w),
            "from_52w_low_pct": ind.distance_pct(price, low_52w),
            "technical_score": score.to_dict(),
            "technical_signal": score.signal,
            "sparkline": spark,
            "sparkline_change_pct": (
                (spark[-1] / spark[0] - 1.0) * 100.0 if len(spark) >= 2 and spark[0] else None
            ),
        }

    # ------------------------------------------------------------------ snapshot
    def get_market_snapshot(self, stage: str = "full", tickers: list[str] | None = None) -> dict[str, Any]:
        """The worksheet payload.

        ``stage='quotes'`` returns the fast path (price + change only) so the
        table can render immediately; ``stage='full'`` adds technicals.
        """
        instruments = self.instruments()
        if tickers:
            wanted = [t for t in dict.fromkeys(tickers)]
            instruments = [i for i in instruments if i.ticker in set(wanted)]
        universe = [i.ticker for i in instruments]

        rows = self.get_quotes(universe)
        by_ticker = {r["ticker"]: r for r in rows}

        if stage == "full":
            self._hydrate(universe, by_ticker)
        else:
            # Warm the technical cache in the background so the follow-up
            # request is served from memory.
            self._schedule_hydration(universe)

        favourites = self.favourites()
        watchlist = set(self.watchlist_tickers())
        inst_by_ticker = {i.ticker: i for i in instruments}

        for ticker, row in by_ticker.items():
            inst = inst_by_ticker.get(ticker)
            groups = list(inst.groups) if inst else row.get("groups") or []
            if ticker in watchlist and WATCHLIST not in groups:
                groups = [WATCHLIST, *groups]
            row["groups"] = groups
            row["is_favourite"] = ticker in favourites
            row["in_watchlist"] = ticker in watchlist
            if inst is not None:
                row["tags"] = list(inst.tags)
                row["region"] = inst.region
                row["note"] = inst.note

        ordered = [by_ticker[t] for t in universe if t in by_ticker]
        provider = get_provider()
        return {
            "rows": ordered,
            "groups": self.group_layout(),
            "stage": stage,
            "as_of": _utc_now_iso(),
            "data_source": provider.name,
            "is_synthetic_source": provider.is_synthetic,
            "is_delayed": bool(getattr(provider, "is_delayed", False)),
            "disclaimer": (
                "SYNTHETIC FIXTURE DATA - NOT MARKET DATA."
                if provider.is_synthetic
                else "Yahoo Finance data is delayed (typically 15 minutes; venue dependent) "
                "and provided for information only."
            ),
            "counts": self._status_counts(ordered),
            "breadth": self.compute_breadth(ordered),
            "provider_circuit": provider_breaker.status(),
        }

    def _hydrate(self, tickers: list[str], by_ticker: dict[str, dict]) -> None:
        """Attach technicals to quote rows, batching the history fetch."""
        fetchable = [t for t in tickers if not self._is_synthetic(t)]
        needed = [t for t in fetchable if cache.get(f"technicals:{t}") is None]
        if needed:
            frames, _stale = self._batch_history(needed, TECHNICAL_PERIOD, "1d")
            for ticker in needed:
                try:
                    payload = self._derive_technicals(ticker, frames.get(ticker))
                except Exception as exc:
                    logger.exception("technicals failed for %s: %s", ticker, exc)
                    payload = {"ticker": ticker, "status": STATUS_ERROR, "message": str(exc)}
                cache.set(f"technicals:{ticker}", payload, settings.ttl_technicals)

        for ticker in tickers:
            row = by_ticker.get(ticker)
            if row is None:
                continue
            payload = cache.get(f"technicals:{ticker}", allow_stale=True)
            if not payload or payload.get("status") not in {STATUS_OK}:
                row["technicals_loaded"] = False
                if row.get("status") == STATUS_OK and payload and payload.get("status") == STATUS_NO_HISTORY:
                    row["status"] = STATUS_NO_HISTORY
                continue
            merged = {k: v for k, v in payload.items() if k not in {"ticker", "status"}}
            # A quote row's 52w range from metadata is a fallback only.
            for key in ("high_52w", "low_52w"):
                if merged.get(key) is None and row.get(key) is not None:
                    merged.pop(key, None)
            row.update(merged)
            row["technicals_loaded"] = True

    def _schedule_hydration(self, tickers: list[str]) -> None:
        key = ",".join(sorted(tickers))[:64]
        with self._hydration_lock:
            if key in self._hydrating:
                return
            self._hydrating.add(key)

        def worker() -> None:
            try:
                self._hydrate(list(tickers), {})
            except Exception as exc:
                logger.warning("background hydration failed: %s", exc)
            finally:
                with self._hydration_lock:
                    self._hydrating.discard(key)

        threading.Thread(target=worker, name="ayo-hydrate", daemon=True).start()

    @staticmethod
    def _status_counts(rows: Iterable[dict]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["status"]] = counts.get(row["status"], 0) + 1
        return counts

    # ------------------------------------------------------------------- breadth
    @staticmethod
    def compute_breadth(rows: Iterable[dict]) -> dict[str, Any]:
        rows = list(rows)
        priced = [r for r in rows if r.get("change_pct") is not None]
        advancing = sum(1 for r in priced if r["change_pct"] > 0)
        declining = sum(1 for r in priced if r["change_pct"] < 0)
        unchanged = len(priced) - advancing - declining

        above_50 = [r for r in rows if r.get("above_sma50") is not None]
        above_200 = [r for r in rows if r.get("above_sma200") is not None]
        pct_50 = (
            sum(1 for r in above_50 if r["above_sma50"]) / len(above_50) * 100.0 if above_50 else None
        )
        pct_200 = (
            sum(1 for r in above_200 if r["above_sma200"]) / len(above_200) * 100.0 if above_200 else None
        )
        return {
            "advancing": advancing,
            "declining": declining,
            "unchanged": unchanged,
            "priced": len(priced),
            "total": len(rows),
            "pct_above_sma50": pct_50,
            "pct_above_sma200": pct_200,
            "sample_sma50": len(above_50),
            "sample_sma200": len(above_200),
        }

    # -------------------------------------------------------------- market strip
    def get_market_strip(self) -> list[dict[str, Any]]:
        rows = self.get_quotes(MARKET_STRIP_TICKERS)
        for row in rows:
            inst = INSTRUMENTS_BY_TICKER.get(row["ticker"])
            row["short_name"] = _STRIP_LABELS.get(row["ticker"], inst.name if inst else row["ticker"])
        return rows

    # -------------------------------------------------------------------- search
    def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        q = query.strip()
        if not q:
            return []

        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        for inst in search_default_universe(q, limit):
            results.append(
                {
                    "ticker": inst.ticker,
                    "name": inst.name,
                    "asset_class": inst.asset_class,
                    "region": inst.region,
                    "in_universe": True,
                    "source": "UNIVERSE",
                }
            )
            seen.add(inst.ticker)

        provider = get_provider()
        try:
            for hit in provider.search(q, limit):
                if hit["ticker"] in seen:
                    continue
                hit["in_universe"] = False
                results.append(hit)
                seen.add(hit["ticker"])
        except Exception as exc:
            logger.info("provider search failed: %s", exc)

        # Exact ticker entry always works even when search is unavailable.
        upper = q.upper()
        if upper not in seen and len(upper) <= 12 and " " not in upper:
            results.append(
                {
                    "ticker": upper,
                    "name": f"Look up {upper}",
                    "asset_class": "UNKNOWN",
                    "in_universe": False,
                    "source": "DIRECT_ENTRY",
                    "requires_validation": True,
                }
            )
        return results[:limit]

    def resolve_ticker(self, ticker: str) -> dict | None:
        """Confirm a hand-entered symbol exists before persisting it."""
        provider = get_provider()
        validate = getattr(provider, "validate", None)
        if validate is None:
            return None
        try:
            return validate(ticker.strip().upper())
        except Exception as exc:
            logger.info("validation failed for %s: %s", ticker, exc)
            return None


_STRIP_LABELS = {
    "^GSPC": "S&P 500",
    "^NDX": "NASDAQ 100",
    "^DJI": "DOW",
    "^FTSE": "FTSE 100",
    "^GDAXI": "DAX",
    "^N225": "NIKKEI",
    "GC=F": "GOLD",
    "CL=F": "WTI",
    "BTC-USD": "BTC",
    "ETH-USD": "ETH",
}

market_data_service = MarketDataService()
