"""API surface, batch-failure isolation and persistence."""

from __future__ import annotations

import pandas as pd
import pytest

from app.data import providers
from app.data.providers.fixture_provider import FixtureProvider


class BrokenProvider:
    """Every call raises - the worst case the service must survive."""

    name = "BROKEN"
    is_synthetic = True

    def fetch_history(self, tickers, period="1y", interval="1d"):
        raise RuntimeError("provider exploded")

    def fetch_metadata(self, tickers):
        raise RuntimeError("provider exploded")

    def search(self, query, limit):
        raise RuntimeError("provider exploded")


class PartialProvider(FixtureProvider):
    """Resolves most symbols but fails for a nominated few."""

    def __init__(self, poisoned):
        self.poisoned = set(poisoned)

    def fetch_history(self, tickers, period="1y", interval="1d"):
        if any(t in self.poisoned for t in tickers) and len(tickers) == 1:
            raise RuntimeError(f"no data for {tickers[0]}")
        good = [t for t in tickers if t not in self.poisoned]
        return super().fetch_history(good, period=period, interval=interval)


class TestHealth:
    def test_health_reports_provider_and_cache(self, client):
        payload = client.get("/api/health").json()
        assert payload["status"] == "ok"
        assert payload["provider"] == "FIXTURE"
        assert payload["instruments"] > 90
        assert "entries" in payload["cache"]

    def test_root_points_at_docs(self, client):
        assert client.get("/").json()["health"] == "/api/health"


class TestInstruments:
    def test_universe_is_available_without_market_data(self, client):
        payload = client.get("/api/instruments").json()
        tickers = {i["ticker"] for i in payload["instruments"]}
        for expected in ("NVDA", "IONQ", "BA.L", "RHM.DE", "^GSPC", "BTC-USD", "GC=F"):
            assert expected in tickers
        assert payload["groups"][0]["name"] == "WATCHLIST"

    def test_instrument_without_a_symbol_is_retained_and_flagged(self, client):
        payload = client.get("/api/instruments").json()
        insilico = next(i for i in payload["instruments"] if i["ticker"] == "INSILICO")
        assert insilico["synthetic"] is True
        assert "no Yahoo Finance symbol" in insilico["note"]


class TestMarketEndpoint:
    def test_full_snapshot_has_rows_groups_and_breadth(self, client):
        payload = client.get("/api/market").json()
        assert len(payload["rows"]) > 90
        assert payload["breadth"]["total"] == len(payload["rows"])
        assert payload["is_synthetic_source"] is True
        assert "NOT MARKET DATA" in payload["disclaimer"]

    def test_quotes_stage_is_served_without_technicals(self, client):
        payload = client.get("/api/market?stage=quotes").json()
        assert payload["stage"] == "quotes"
        assert all("rsi14" not in row for row in payload["rows"])

    def test_full_stage_carries_technicals(self, client):
        rows = client.get("/api/market?stage=full").json()["rows"]
        nvda = next(r for r in rows if r["ticker"] == "NVDA")
        assert nvda["technicals_loaded"] is True
        for field in ("rsi14", "macd_histogram", "sma200", "trend", "technical_signal",
                      "relative_volume", "atr14", "volatility_20d", "sparkline"):
            assert nvda[field] is not None

    def test_subset_filtering(self, client):
        rows = client.get("/api/market?tickers=NVDA,AMD").json()["rows"]
        assert {r["ticker"] for r in rows} == {"NVDA", "AMD"}

    def test_unresolvable_symbols_are_reported_not_dropped(self, client):
        rows = client.get("/api/market").json()["rows"]
        by_ticker = {r["ticker"]: r for r in rows}
        assert by_ticker["CBRS"]["status"] == "UNAVAILABLE"
        assert by_ticker["CBRS"]["last"] is None
        assert by_ticker["INSILICO"]["status"] == "UNAVAILABLE"
        assert by_ticker["LBPH"]["status"] == "DELISTED"

    def test_no_price_is_ever_invented(self, client):
        rows = client.get("/api/market").json()["rows"]
        for row in rows:
            if row["status"] in {"UNAVAILABLE", "DELISTED"}:
                assert row["last"] is None
                assert row["change_pct"] is None


class TestBatchFailureIsolation:
    """The critical requirement: one bad ticker must not break /api/market."""

    def test_single_invalid_ticker_does_not_fail_the_batch(self, client):
        providers.set_provider(PartialProvider({"NVDA", "IONQ"}))
        response = client.get("/api/market")
        assert response.status_code == 200
        rows = {r["ticker"]: r for r in response.json()["rows"]}
        assert rows["NVDA"]["status"] == "UNAVAILABLE"
        assert rows["NVDA"]["last"] is None
        # Healthy neighbours are unaffected.
        assert rows["AMD"]["status"] == "OK"
        assert rows["AMD"]["last"] is not None

    def test_totally_broken_provider_still_returns_a_worksheet(self, client):
        providers.set_provider(BrokenProvider())
        response = client.get("/api/market")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["rows"]) > 90
        assert all(r["status"] in {"UNAVAILABLE", "DELISTED", "ERROR"} for r in payload["rows"])
        assert payload["breadth"]["advancing"] == 0

    def test_quote_for_an_unknown_symbol_is_a_row_not_an_error(self, client):
        providers.set_provider(PartialProvider({"ZZZZ"}))
        payload = client.get("/api/quote/ZZZZ").json()
        assert payload["status"] == "UNAVAILABLE"
        assert payload["last"] is None

    def test_history_for_an_unknown_symbol_returns_an_empty_series(self, client):
        providers.set_provider(PartialProvider({"ZZZZ"}))
        payload = client.get("/api/history/ZZZZ").json()
        assert payload["status"] == "UNAVAILABLE"
        assert payload["candles"] == []

    def test_technicals_for_an_unknown_symbol_report_no_history(self, client):
        providers.set_provider(PartialProvider({"ZZZZ"}))
        payload = client.get("/api/technicals/ZZZZ").json()
        assert payload["status"] == "NO_HISTORY"

    def test_stale_cache_is_served_when_a_refresh_fails(self, client):
        from app.core.cache import cache

        good = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"][0]
        assert good["last"] is not None

        # Expire the cached entry, then break the provider.
        entry = cache.get_entry("history:NVDA:1mo:1d")
        entry.ttl = 0
        providers.set_provider(BrokenProvider())

        stale = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"][0]
        assert stale["status"] == "STALE"
        assert stale["last"] == pytest.approx(good["last"])


class TestHistoryAndTechnicals:
    def test_history_returns_ohlcv_candles(self, client):
        payload = client.get("/api/history/NVDA?period=6mo&interval=1d").json()
        assert payload["status"] == "OK"
        assert len(payload["candles"]) > 50
        candle = payload["candles"][-1]
        assert candle["h"] >= candle["l"]
        assert set(candle) == {"t", "o", "h", "l", "c", "v"}

    def test_symbols_with_special_characters_work(self, client):
        for ticker in ("^GSPC", "BTC-USD", "GC=F", "BA.L"):
            payload = client.get(f"/api/history/{ticker}?period=1mo").json()
            assert payload["ticker"] == ticker
            assert payload["status"] == "OK"

    def test_invalid_period_is_rejected(self, client):
        assert client.get("/api/history/NVDA?period=17y").status_code == 400

    def test_invalid_interval_is_rejected(self, client):
        assert client.get("/api/history/NVDA?interval=3s").status_code == 400

    def test_technicals_expose_the_score_breakdown(self, client):
        payload = client.get("/api/technicals/NVDA").json()
        score = payload["technical_score"]
        assert score["score"] == sum(c["points"] for c in score["components"])
        assert score["signal"] == payload["technical_signal"]
        assert "not investment advice" in score["disclaimer"].lower()


class TestQuotesEndpoint:
    def test_post_quotes(self, client):
        payload = client.post("/api/quotes", json={"tickers": ["NVDA", "AMD"]}).json()
        assert len(payload["rows"]) == 2

    def test_empty_request(self, client):
        assert client.post("/api/quotes", json={"tickers": []}).json()["rows"] == []

    def test_unexpected_fields_are_rejected(self, client):
        assert client.post("/api/quotes", json={"tickers": [], "evil": 1}).status_code == 422


class TestSearch:
    def test_matches_by_ticker_and_name(self, client):
        assert "NVDA" in [r["ticker"] for r in client.get("/api/search?q=nvid").json()["results"]]
        assert "IONQ" in [r["ticker"] for r in client.get("/api/search?q=ionq").json()["results"]]

    def test_direct_entry_is_always_offered(self, client):
        results = client.get("/api/search?q=ZZZZ").json()["results"]
        assert any(r["source"] == "DIRECT_ENTRY" for r in results)

    def test_blank_query_returns_nothing(self, client):
        assert client.get("/api/search?q=").json()["results"] == []

    def test_search_survives_a_broken_provider(self, client):
        providers.set_provider(BrokenProvider())
        results = client.get("/api/search?q=nvda").json()["results"]
        assert any(r["ticker"] == "NVDA" for r in results)


class TestWatchlists:
    def test_default_watchlist_exists(self, client):
        payload = client.get("/api/watchlists").json()
        assert payload["watchlists"][0]["name"] == "WATCHLIST"
        assert payload["watchlists"][0]["is_default"] is True

    def test_add_and_remove_a_security(self, client):
        wid = client.get("/api/watchlists").json()["watchlists"][0]["id"]
        added = client.post(f"/api/watchlists/{wid}/instruments", json={"ticker": "sofi"}).json()
        assert "SOFI" in [i["ticker"] for i in added["watchlist"]["instruments"]]

        rows = client.get("/api/market?stage=quotes").json()["rows"]
        sofi = next(r for r in rows if r["ticker"] == "SOFI")
        assert sofi["in_watchlist"] is True
        assert "WATCHLIST" in sofi["groups"]

        client.delete(f"/api/watchlists/{wid}/instruments/SOFI")
        after = client.get("/api/watchlists").json()["watchlists"][0]
        assert after["instruments"] == []

    def test_create_rename_and_delete(self, client):
        created = client.post("/api/watchlists", json={"name": "swing"}).json()
        assert created["name"] == "SWING"
        renamed = client.patch(f"/api/watchlists/{created['id']}", json={"name": "momentum"}).json()
        assert renamed["name"] == "MOMENTUM"
        assert client.delete(f"/api/watchlists/{created['id']}").status_code == 200

    def test_duplicate_name_is_rejected(self, client):
        client.post("/api/watchlists", json={"name": "alpha"})
        assert client.post("/api/watchlists", json={"name": "alpha"}).status_code == 400

    def test_default_watchlist_cannot_be_deleted(self, client):
        wid = client.get("/api/watchlists").json()["watchlists"][0]["id"]
        assert client.delete(f"/api/watchlists/{wid}").status_code == 400

    def test_unknown_watchlist_is_404(self, client):
        assert client.patch("/api/watchlists/999", json={"name": "x"}).status_code == 404

    def test_favourites_round_trip(self, client):
        assert client.post("/api/favourites", json={"ticker": "NVDA"}).json()["favourites"] == ["NVDA"]
        rows = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"]
        assert rows[0]["is_favourite"] is True
        assert client.post(
            "/api/favourites", json={"ticker": "NVDA", "favourite": False}
        ).json()["favourites"] == []

    def test_moving_a_security_between_groups(self, client):
        client.post("/api/instruments/move", json={"ticker": "NVDA", "group": "US MEGA CAP"})
        rows = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"]
        assert rows[0]["groups"] == ["US MEGA CAP"]

    def test_persistence_survives_a_new_connection(self, client):
        from app.core import db

        client.post("/api/favourites", json={"ticker": "AMD"})
        db.reset_connection()
        assert client.get("/api/watchlists").json()["favourites"] == ["AMD"]


class TestMarketStrip:
    def test_strip_has_labelled_indices(self, client):
        items = client.get("/api/strip").json()["items"]
        labels = {i["short_name"] for i in items}
        assert {"S&P 500", "GOLD", "BTC"} <= labels


class TestBreadth:
    def test_breadth_counts_only_priced_rows(self, client):
        payload = client.get("/api/market").json()
        breadth = payload["breadth"]
        assert breadth["advancing"] + breadth["declining"] + breadth["unchanged"] == breadth["priced"]
        assert breadth["priced"] < breadth["total"]  # the unavailable rows are excluded
        assert 0 <= breadth["pct_above_sma50"] <= 100
