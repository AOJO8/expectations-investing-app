"""Circuit breaker behaviour and the retry policy it protects."""

from __future__ import annotations

import time

import pandas as pd
import pytest

from app.core.circuit import CircuitBreaker, CircuitOpen, provider_breaker
from app.data import providers
from app.data.providers.fixture_provider import FixtureProvider


@pytest.fixture(autouse=True)
def clean_breaker():
    provider_breaker.reset()
    yield
    provider_breaker.reset()


class TestCircuitBreaker:
    def test_closed_until_the_threshold(self):
        breaker = CircuitBreaker(failure_threshold=3, cooldown_seconds=30)
        breaker.record_failure()
        breaker.record_failure()
        assert breaker.is_open is False
        breaker.check()  # does not raise

    def test_opens_on_the_threshold(self):
        breaker = CircuitBreaker(failure_threshold=3, cooldown_seconds=30)
        for _ in range(3):
            breaker.record_failure()
        assert breaker.is_open is True
        with pytest.raises(CircuitOpen):
            breaker.check()

    def test_success_resets_the_run(self):
        breaker = CircuitBreaker(failure_threshold=3, cooldown_seconds=30)
        breaker.record_failure()
        breaker.record_failure()
        breaker.record_success()
        breaker.record_failure()
        assert breaker.is_open is False

    def test_half_opens_after_the_cooldown(self):
        breaker = CircuitBreaker(failure_threshold=2, cooldown_seconds=0.05)
        breaker.record_failure()
        breaker.record_failure()
        assert breaker.is_open is True
        time.sleep(0.08)
        # The probe is allowed through...
        assert breaker.is_open is False
        # ...and a single further failure re-opens it immediately.
        breaker.record_failure()
        assert breaker.is_open is True

    def test_probe_success_closes_it(self):
        breaker = CircuitBreaker(failure_threshold=2, cooldown_seconds=0.05)
        breaker.record_failure()
        breaker.record_failure()
        time.sleep(0.08)
        assert breaker.is_open is False
        breaker.record_success()
        assert breaker.status()["consecutive_failures"] == 0
        assert breaker.is_open is False


class DeadProvider(FixtureProvider):
    """Resolves nothing, and records every symbol it was asked for."""

    def __init__(self):
        self.history_calls: list[tuple[str, list[str]]] = []

    def fetch_history(self, tickers, period="1y", interval="1d"):
        self.history_calls.append((period, list(tickers)))
        return {}

    def fetch_metadata(self, tickers):
        return {}


class TestRetryPolicy:
    def test_a_dead_provider_is_not_retried_per_symbol(self, client):
        """A connectivity failure must not be multiplied by the universe size.

        The quote pass (1mo) and the technical pass (2y) are separate windows,
        so each is allowed one attempt per symbol - but never more.
        """
        dead = DeadProvider()
        providers.set_provider(dead)

        response = client.get("/api/market?stage=quotes")
        assert response.status_code == 200
        time.sleep(0.4)  # let background hydration finish

        per_period: dict[str, list[str]] = {}
        for period, tickers in dead.history_calls:
            per_period.setdefault(period, []).extend(tickers)

        for period, tickers in per_period.items():
            duplicates = {t for t in tickers if tickers.count(t) > 1}
            assert not duplicates, f"{period} re-requested {sorted(duplicates)[:5]}"

    def test_a_failed_symbol_is_not_re_requested_within_its_ttl(self, client):
        """A second snapshot must not re-hammer symbols that just failed."""
        dead = DeadProvider()
        providers.set_provider(dead)

        client.get("/api/market?stage=quotes&tickers=NVDA,AMD")
        first = sum(len(t) for _, t in dead.history_calls)
        dead.history_calls.clear()

        client.get("/api/market?stage=quotes&tickers=NVDA,AMD")
        second = sum(len(t) for _, t in dead.history_calls)

        assert first > 0
        assert second == 0, "failed lookups should be negative-cached briefly"

    def test_worksheet_still_renders_every_row(self, client):
        providers.set_provider(DeadProvider())
        payload = client.get("/api/market?stage=quotes").json()
        assert len(payload["rows"]) > 90
        assert all(row["last"] is None for row in payload["rows"])
        assert payload["breadth"]["priced"] == 0

    def test_open_circuit_is_reported_to_the_client(self, client):
        provider_breaker.reset()
        for _ in range(provider_breaker.failure_threshold):
            provider_breaker.record_failure()
        payload = client.get("/api/market?stage=quotes").json()
        assert payload["provider_circuit"]["open"] is True

    def test_health_reports_the_circuit(self, client):
        payload = client.get("/api/health").json()
        assert payload["provider_circuit"]["open"] is False


class TestStaleServeInteraction:
    def test_cached_history_survives_an_open_circuit(self, client):
        from app.core.cache import cache

        good = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"][0]
        assert good["last"] is not None

        cache.get_entry("history:NVDA:1mo:1d").ttl = 0
        providers.set_provider(DeadProvider())
        for _ in range(provider_breaker.failure_threshold):
            provider_breaker.record_failure()

        stale = client.get("/api/market?stage=quotes&tickers=NVDA").json()["rows"][0]
        assert stale["status"] == "STALE"
        assert stale["last"] == pytest.approx(good["last"])
        assert isinstance(stale["last"], float)


def test_indicator_module_is_unaffected_by_provider_state():
    """The maths layer has no provider dependency at all."""
    from app.services import indicators as ind

    series = pd.Series(range(1, 60), dtype="float64")
    assert ind.sma(series, 20) is not None
