"""HTTP surface. Thin by design: no yfinance, no pandas, no indicator maths."""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from ..core.cache import cache
from ..core.circuit import provider_breaker
from ..core.config import settings
from ..data.instruments import GROUP_ORDER
from ..data.providers import get_provider
from ..models.schemas import (
    FavouriteRequest,
    GroupOrderRequest,
    HealthResponse,
    MoveGroupRequest,
    QuotesRequest,
    WatchlistCreate,
    WatchlistInstrumentAdd,
    WatchlistPatch,
)
from ..services import watchlists as wl
from ..services.market_data import _utc_now_iso, market_data_service as svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

VERSION = "1.0.0"

VALID_PERIODS = {"1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y", "5y", "10y", "max"}
VALID_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"}


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    provider = get_provider()
    return HealthResponse(
        status="ok",
        provider=provider.name,
        is_synthetic_source=provider.is_synthetic,
        version=VERSION,
        cache=cache.stats(),
        instruments=len(svc.instruments()),
        provider_circuit=provider_breaker.status(),
    )


@router.get("/market")
def market(
    stage: str = Query("full", pattern="^(quotes|full)$"),
    tickers: str | None = Query(None, description="Optional comma-separated subset"),
) -> dict:
    """The worksheet payload.

    Never fails because of an individual instrument: per-security problems are
    reported as a ``status`` on that row.
    """
    subset = [t.strip().upper() for t in tickers.split(",")] if tickers else None
    return svc.get_market_snapshot(stage=stage, tickers=subset)


@router.get("/instruments")
def instruments() -> dict:
    """Static universe - available before any market data has loaded."""
    items = svc.instruments()
    favourites = svc.favourites()
    watchlist = set(svc.watchlist_tickers())
    return {
        "instruments": [
            {
                "ticker": i.ticker,
                "name": i.name,
                "groups": list(i.groups) + ([ "WATCHLIST" ] if i.ticker in watchlist and "WATCHLIST" not in i.groups else []),
                "asset_class": i.asset_class,
                "region": i.region,
                "tags": list(i.tags),
                "currency_hint": i.currency_hint,
                "synthetic": i.synthetic,
                "note": i.note,
                "is_favourite": i.ticker in favourites,
            }
            for i in items
        ],
        "groups": svc.group_layout(),
        "group_catalogue": wl.available_groups(),
        "default_group_order": GROUP_ORDER,
    }


@router.get("/strip")
def market_strip() -> dict:
    provider = get_provider()
    return {
        "items": svc.get_market_strip(),
        "as_of": _utc_now_iso(),
        "data_source": provider.name,
        "is_synthetic_source": provider.is_synthetic,
    }


@router.get("/quote/{ticker:path}")
def quote(ticker: str) -> dict:
    return svc.get_quote(ticker.strip().upper())


@router.post("/quotes")
def quotes(payload: QuotesRequest) -> dict:
    tickers = [t.strip().upper() for t in payload.tickers if t.strip()]
    rows = svc.get_quotes(tickers)
    return {"rows": rows, "counts": svc._status_counts(rows)}


@router.get("/history/{ticker:path}")
def history(
    ticker: str,
    period: str = Query("1y"),
    interval: str = Query("1d"),
) -> dict:
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"unsupported period {period!r}")
    if interval not in VALID_INTERVALS:
        raise HTTPException(status_code=400, detail=f"unsupported interval {interval!r}")

    ticker = ticker.strip().upper()
    frame, stale = svc.get_history(ticker, period=period, interval=interval)
    if frame is None or frame.empty:
        return {
            "ticker": ticker,
            "period": period,
            "interval": interval,
            "status": "UNAVAILABLE",
            "candles": [],
            "message": "No history returned by the provider for this symbol.",
        }

    candles = []
    for ts, row in frame.iterrows():
        def val(col: str):
            v = row.get(col)
            try:
                f = float(v)
            except (TypeError, ValueError):
                return None
            return None if f != f else f  # drop NaN

        candles.append(
            {
                "t": ts.isoformat(),
                "o": val("Open"),
                "h": val("High"),
                "l": val("Low"),
                "c": val("Close"),
                "v": val("Volume"),
            }
        )
    return {
        "ticker": ticker,
        "period": period,
        "interval": interval,
        "status": "STALE" if stale else "OK",
        "candles": candles,
    }


@router.get("/technicals/{ticker:path}")
def technicals(ticker: str) -> dict:
    return svc.get_technicals(ticker.strip().upper())


@router.get("/search")
def search(q: str = Query("", max_length=64), limit: int = Query(20, ge=1, le=50)) -> dict:
    return {"query": q, "results": svc.search(q, limit)}


# --------------------------------------------------------------------- watchlists

@router.get("/watchlists")
def get_watchlists() -> dict:
    return {"watchlists": wl.list_watchlists(), "favourites": wl.list_favourites()}


@router.post("/watchlists", status_code=201)
def post_watchlist(payload: WatchlistCreate) -> dict:
    try:
        return wl.create_watchlist(payload.name)
    except wl.WatchlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/watchlists/{watchlist_id}")
def patch_watchlist(watchlist_id: int, payload: WatchlistPatch) -> dict:
    try:
        return wl.update_watchlist(watchlist_id, name=payload.name, position=payload.position)
    except wl.WatchlistError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: int) -> dict:
    try:
        wl.delete_watchlist(watchlist_id)
    except wl.WatchlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deleted": watchlist_id}


@router.post("/watchlists/{watchlist_id}/instruments")
def add_watchlist_instrument(
    watchlist_id: int, payload: WatchlistInstrumentAdd, background: BackgroundTasks
) -> dict:
    ticker = payload.ticker.strip().upper()
    resolved = None
    if payload.validate_symbol:
        resolved = svc.resolve_ticker(ticker)
        if resolved is None and payload.name is None:
            # Do not block the user on an imperfect symbol service: accept the
            # symbol and let the worksheet report UNAVAILABLE if it never resolves.
            logger.info("could not validate %s - adding unvalidated", ticker)

    try:
        result = wl.add_instrument(
            watchlist_id,
            ticker,
            name=payload.name or (resolved or {}).get("name"),
            group=payload.group,
            asset_class=(resolved or {}).get("asset_class") or payload.asset_class,
            region=payload.region,
        )
    except wl.WatchlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    background.add_task(svc.get_quotes, [ticker])
    return {"watchlist": result, "resolved": resolved, "validated": resolved is not None}


@router.delete("/watchlists/{watchlist_id}/instruments/{ticker:path}")
def delete_watchlist_instrument(watchlist_id: int, ticker: str) -> dict:
    try:
        return wl.remove_instrument(watchlist_id, ticker)
    except wl.WatchlistError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/favourites")
def post_favourite(payload: FavouriteRequest) -> dict:
    return {"favourites": wl.set_favourite(payload.ticker, payload.favourite)}


@router.post("/instruments/move")
def move_instrument(payload: MoveGroupRequest) -> dict:
    wl.move_instrument(payload.ticker, payload.group)
    return {"ticker": payload.ticker.upper(), "group": payload.group.upper()}


@router.post("/groups/order")
def set_group_order(payload: GroupOrderRequest) -> dict:
    return {"groups": wl.set_group_order(payload.groups)}


@router.post("/cache/clear")
def clear_cache(prefix: str | None = None) -> dict:
    return {"cleared": cache.invalidate(prefix)}
