"""SQLite persistence for watchlists, user-added tickers and favourites.

Kept deliberately small: one connection factory, explicit SQL, no ORM. The
schema is created on startup and is safe to run repeatedly.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import settings

_local = threading.local()
_init_lock = threading.Lock()
_initialised: set[str] = set()

SCHEMA = """
CREATE TABLE IF NOT EXISTS watchlists (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL UNIQUE,
    is_default   INTEGER NOT NULL DEFAULT 0,
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist_members (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_id  INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    ticker        TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    added_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (watchlist_id, ticker)
);

-- Securities the user added that are not part of the built-in universe.
CREATE TABLE IF NOT EXISTS user_instruments (
    ticker       TEXT PRIMARY KEY,
    name         TEXT,
    group_name   TEXT NOT NULL,
    asset_class  TEXT NOT NULL DEFAULT 'EQUITY',
    region       TEXT NOT NULL DEFAULT 'US',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Group overrides for built-in instruments the user moved.
CREATE TABLE IF NOT EXISTS instrument_overrides (
    ticker       TEXT PRIMARY KEY,
    group_name   TEXT,
    hidden       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favourites (
    ticker     TEXT PRIMARY KEY,
    added_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_order (
    group_name TEXT PRIMARY KEY,
    position   INTEGER NOT NULL,
    collapsed  INTEGER NOT NULL DEFAULT 0
);

-- Long-lived metadata cache so a restart does not re-hammer Yahoo.
CREATE TABLE IF NOT EXISTS metadata_cache (
    ticker      TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    fetched_at  REAL NOT NULL
);
"""


def _connect(path: str) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_connection() -> sqlite3.Connection:
    """One connection per thread, created lazily."""
    path = settings.database_path
    conn = getattr(_local, "conn", None)
    if conn is None or getattr(_local, "path", None) != path:
        conn = _connect(path)
        _local.conn = conn
        _local.path = path
        init_db()
    return conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db() -> None:
    path = settings.database_path
    with _init_lock:
        conn = getattr(_local, "conn", None) or _connect(path)
        _local.conn = conn
        _local.path = path
        conn.executescript(SCHEMA)
        conn.commit()
        if path not in _initialised:
            _seed_defaults(conn)
            _initialised.add(path)


def _seed_defaults(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT COUNT(*) AS n FROM watchlists").fetchone()
    if row and row["n"] == 0:
        conn.execute(
            "INSERT INTO watchlists (name, is_default, position) VALUES (?, 1, 0)",
            ("WATCHLIST",),
        )
        conn.commit()


def query(sql: str, params: tuple | dict = ()) -> list[dict[str, Any]]:
    cur = get_connection().execute(sql, params)
    return [dict(r) for r in cur.fetchall()]


def execute(sql: str, params: tuple | dict = ()) -> int:
    with transaction() as conn:
        cur = conn.execute(sql, params)
        return cur.lastrowid if cur.lastrowid is not None else cur.rowcount


def reset_connection() -> None:
    """Drop this thread's connection (used by the test suite)."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        conn.close()
    _local.conn = None
    _local.path = None
