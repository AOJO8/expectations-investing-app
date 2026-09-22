"""Runtime configuration (environment driven)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class Settings:
    #: "yfinance" for live Yahoo Finance data, "fixture" for the offline
    #: development provider. Fixture data is clearly flagged all the way to
    #: the UI and must never be presented as market data.
    provider: str = field(default_factory=lambda: os.environ.get("AYO_PROVIDER", "yfinance"))
    database_path: str = field(
        default_factory=lambda: os.environ.get("AYO_DB_PATH", str(BASE_DIR / "data" / "ayo.db"))
    )
    cors_origins: list[str] = field(
        default_factory=lambda: os.environ.get(
            "AYO_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
    )
    # Cache TTLs (seconds)
    ttl_quotes: int = field(default_factory=lambda: _env_int("AYO_TTL_QUOTES", 60))
    ttl_history_recent: int = field(default_factory=lambda: _env_int("AYO_TTL_HISTORY_RECENT", 300))
    ttl_technicals: int = field(default_factory=lambda: _env_int("AYO_TTL_TECHNICALS", 300))
    ttl_history_long: int = field(default_factory=lambda: _env_int("AYO_TTL_HISTORY_LONG", 1800))
    ttl_metadata: int = field(default_factory=lambda: _env_int("AYO_TTL_METADATA", 60 * 60 * 24))
    #: Hard ceiling on how stale a cache entry may be when served as a
    #: fallback after a provider failure.
    max_stale_seconds: int = field(default_factory=lambda: _env_int("AYO_MAX_STALE", 60 * 60 * 12))
    #: Threads used for per-ticker metadata fetches.
    metadata_workers: int = field(default_factory=lambda: _env_int("AYO_METADATA_WORKERS", 8))

    @property
    def is_fixture(self) -> bool:
        return self.provider.lower() == "fixture"


settings = Settings()
