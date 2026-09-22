from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("AYO_PROVIDER", "fixture")


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    """Each test gets its own SQLite file, empty cache and fixture provider."""
    from app.core import db
    from app.core.cache import cache
    from app.core.config import settings
    from app.data import providers

    monkeypatch.setattr(settings, "database_path", str(tmp_path / "ayo.db"))
    monkeypatch.setattr(settings, "provider", "fixture")
    db.reset_connection()
    db._initialised.clear()
    cache.invalidate()
    providers.set_provider(providers.FixtureProvider())
    yield
    db.reset_connection()
    providers.set_provider(None)
    cache.invalidate()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        yield c
