"""Small thread-safe TTL cache with explicit stale-serve semantics.

Yahoo Finance is rate limited and occasionally flaky. When a refresh fails we
would rather show the last good value clearly marked STALE than show nothing,
so every entry records when it was produced and the caller decides whether a
stale read is acceptable.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Generic, TypeVar

T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    value: T
    stored_at: float
    ttl: float

    @property
    def age(self) -> float:
        return time.time() - self.stored_at

    @property
    def is_fresh(self) -> bool:
        return self.age < self.ttl


class TTLCache:
    def __init__(self) -> None:
        self._data: dict[str, CacheEntry[Any]] = {}
        self._lock = threading.RLock()

    def get_entry(self, key: str) -> CacheEntry[Any] | None:
        with self._lock:
            return self._data.get(key)

    def get(self, key: str, allow_stale: bool = False) -> Any | None:
        entry = self.get_entry(key)
        if entry is None:
            return None
        if entry.is_fresh or allow_stale:
            return entry.value
        return None

    def set(self, key: str, value: Any, ttl: float) -> None:
        with self._lock:
            self._data[key] = CacheEntry(value=value, stored_at=time.time(), ttl=ttl)

    def invalidate(self, prefix: str | None = None) -> int:
        with self._lock:
            if prefix is None:
                count = len(self._data)
                self._data.clear()
                return count
            keys = [k for k in self._data if k.startswith(prefix)]
            for k in keys:
                del self._data[k]
            return len(keys)

    def stats(self) -> dict[str, Any]:
        with self._lock:
            fresh = sum(1 for e in self._data.values() if e.is_fresh)
            return {"entries": len(self._data), "fresh": fresh, "stale": len(self._data) - fresh}

    def get_or_compute(
        self,
        key: str,
        ttl: float,
        producer: Callable[[], T],
        max_stale: float | None = None,
    ) -> tuple[T | None, bool, float | None]:
        """Return ``(value, is_stale, age_seconds)``.

        On a producer failure a cached value within ``max_stale`` is returned
        and flagged stale; if there is nothing usable the exception propagates
        so the caller can mark the instrument ERROR rather than fabricate one.
        """
        entry = self.get_entry(key)
        if entry is not None and entry.is_fresh:
            return entry.value, False, entry.age

        try:
            value = producer()
        except Exception:
            if entry is not None and (max_stale is None or entry.age <= max_stale):
                return entry.value, True, entry.age
            raise
        self.set(key, value, ttl)
        return value, False, 0.0


cache = TTLCache()
