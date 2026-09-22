"""A small circuit breaker for the market-data provider.

When Yahoo Finance is unreachable - a network outage, an egress policy, a rate
limit - every request would otherwise pay the full retry cost of every symbol.
Measured against a blocked endpoint, one snapshot of ~100 instruments issued
400+ doomed HTTP attempts and took minutes.

The breaker trips after a run of consecutive failures and then fails fast for a
cooldown, so the worksheet renders immediately with honest UNAVAILABLE rows
instead of hanging. A single probe is allowed through once the cooldown expires
(half-open), and any success closes the breaker.
"""

from __future__ import annotations

import logging
import threading
import time

logger = logging.getLogger(__name__)


class CircuitOpen(RuntimeError):
    """Raised instead of calling a provider that is currently failing fast."""


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, cooldown_seconds: float = 60.0) -> None:
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._lock = threading.RLock()
        self._consecutive_failures = 0
        self._opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        with self._lock:
            if self._opened_at is None:
                return False
            if time.time() - self._opened_at >= self.cooldown_seconds:
                # Half-open: let the next call through as a probe.
                self._opened_at = None
                self._consecutive_failures = self.failure_threshold - 1
                logger.info("provider circuit half-open - allowing a probe request")
                return False
            return True

    def check(self) -> None:
        if self.is_open:
            raise CircuitOpen("provider is failing fast; serving cached or unavailable data")

    def record_success(self) -> None:
        with self._lock:
            if self._consecutive_failures or self._opened_at:
                logger.info("provider circuit closed after a successful call")
            self._consecutive_failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold and self._opened_at is None:
                self._opened_at = time.time()
                logger.warning(
                    "provider circuit OPEN after %s consecutive failures - "
                    "failing fast for %ss so requests do not hang",
                    self._consecutive_failures,
                    self.cooldown_seconds,
                )

    def reset(self) -> None:
        with self._lock:
            self._consecutive_failures = 0
            self._opened_at = None

    def status(self) -> dict:
        with self._lock:
            return {
                "open": self._opened_at is not None,
                "consecutive_failures": self._consecutive_failures,
                "cooldown_seconds": self.cooldown_seconds,
                "reopens_in": (
                    max(0.0, self.cooldown_seconds - (time.time() - self._opened_at))
                    if self._opened_at
                    else 0.0
                ),
            }


provider_breaker = CircuitBreaker()
