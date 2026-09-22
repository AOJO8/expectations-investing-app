"""Watchlist, favourite and user-instrument persistence (SQLite backed)."""

from __future__ import annotations

from typing import Any

from ..core import db
from ..data.instruments import GROUP_ORDER, INSTRUMENTS_BY_TICKER, WATCHLIST


class WatchlistError(ValueError):
    """Raised for client-correctable problems (unknown id, duplicate name)."""


def list_watchlists() -> list[dict[str, Any]]:
    lists = db.query("SELECT * FROM watchlists ORDER BY position, id")
    members = db.query("SELECT * FROM watchlist_members ORDER BY position, added_at")
    grouped: dict[int, list[dict]] = {}
    for m in members:
        grouped.setdefault(m["watchlist_id"], []).append(
            {"ticker": m["ticker"], "position": m["position"], "added_at": m["added_at"]}
        )
    return [
        {
            "id": w["id"],
            "name": w["name"],
            "is_default": bool(w["is_default"]),
            "position": w["position"],
            "instruments": grouped.get(w["id"], []),
        }
        for w in lists
    ]


def get_watchlist(watchlist_id: int) -> dict[str, Any]:
    for w in list_watchlists():
        if w["id"] == watchlist_id:
            return w
    raise WatchlistError(f"watchlist {watchlist_id} not found")


def create_watchlist(name: str) -> dict[str, Any]:
    name = name.strip().upper()
    if not name:
        raise WatchlistError("name is required")
    if db.query("SELECT id FROM watchlists WHERE name = ?", (name,)):
        raise WatchlistError(f"watchlist {name!r} already exists")
    position = len(db.query("SELECT id FROM watchlists"))
    new_id = db.execute(
        "INSERT INTO watchlists (name, is_default, position) VALUES (?, 0, ?)", (name, position)
    )
    return get_watchlist(int(new_id))


def update_watchlist(watchlist_id: int, name: str | None = None, position: int | None = None) -> dict[str, Any]:
    existing = get_watchlist(watchlist_id)
    if name is not None:
        db.execute("UPDATE watchlists SET name = ? WHERE id = ?", (name.strip().upper(), watchlist_id))
    if position is not None:
        db.execute("UPDATE watchlists SET position = ? WHERE id = ?", (position, watchlist_id))
    return get_watchlist(existing["id"])


def delete_watchlist(watchlist_id: int) -> None:
    w = get_watchlist(watchlist_id)
    if w["is_default"]:
        raise WatchlistError("the default watchlist cannot be deleted")
    db.execute("DELETE FROM watchlists WHERE id = ?", (watchlist_id,))


def default_watchlist_id() -> int:
    rows = db.query("SELECT id FROM watchlists WHERE is_default = 1 ORDER BY id LIMIT 1")
    if rows:
        return int(rows[0]["id"])
    return int(db.execute("INSERT INTO watchlists (name, is_default, position) VALUES ('WATCHLIST', 1, 0)"))


def add_instrument(
    watchlist_id: int,
    ticker: str,
    name: str | None = None,
    group: str | None = None,
    asset_class: str = "EQUITY",
    region: str = "US",
) -> dict[str, Any]:
    """Add a symbol to a watchlist, registering it as a user instrument if new."""
    ticker = ticker.strip().upper()
    if not ticker:
        raise WatchlistError("ticker is required")
    get_watchlist(watchlist_id)

    if ticker not in INSTRUMENTS_BY_TICKER:
        target_group = (group or WATCHLIST).strip().upper()
        db.execute(
            "INSERT INTO user_instruments (ticker, name, group_name, asset_class, region) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(ticker) DO UPDATE SET "
            "name = COALESCE(excluded.name, user_instruments.name), group_name = excluded.group_name",
            (ticker, name, target_group, asset_class, region),
        )
    elif group:
        move_instrument(ticker, group)

    position = len(db.query("SELECT id FROM watchlist_members WHERE watchlist_id = ?", (watchlist_id,)))
    db.execute(
        "INSERT INTO watchlist_members (watchlist_id, ticker, position) VALUES (?, ?, ?) "
        "ON CONFLICT(watchlist_id, ticker) DO NOTHING",
        (watchlist_id, ticker, position),
    )
    return get_watchlist(watchlist_id)


def remove_instrument(watchlist_id: int, ticker: str) -> dict[str, Any]:
    ticker = ticker.strip().upper()
    get_watchlist(watchlist_id)
    db.execute(
        "DELETE FROM watchlist_members WHERE watchlist_id = ? AND ticker = ?", (watchlist_id, ticker)
    )
    # A user-added symbol that is no longer on any watchlist leaves the universe.
    if ticker not in INSTRUMENTS_BY_TICKER:
        remaining = db.query("SELECT id FROM watchlist_members WHERE ticker = ?", (ticker,))
        if not remaining:
            db.execute("DELETE FROM user_instruments WHERE ticker = ?", (ticker,))
    return get_watchlist(watchlist_id)


def move_instrument(ticker: str, group: str) -> None:
    """Reassign a security to a different worksheet section."""
    ticker = ticker.strip().upper()
    group = group.strip().upper()
    if ticker in INSTRUMENTS_BY_TICKER:
        db.execute(
            "INSERT INTO instrument_overrides (ticker, group_name, hidden) VALUES (?, ?, 0) "
            "ON CONFLICT(ticker) DO UPDATE SET group_name = excluded.group_name",
            (ticker, group),
        )
    else:
        db.execute("UPDATE user_instruments SET group_name = ? WHERE ticker = ?", (group, ticker))


def set_favourite(ticker: str, favourite: bool) -> list[str]:
    ticker = ticker.strip().upper()
    if favourite:
        db.execute("INSERT INTO favourites (ticker) VALUES (?) ON CONFLICT(ticker) DO NOTHING", (ticker,))
    else:
        db.execute("DELETE FROM favourites WHERE ticker = ?", (ticker,))
    return [r["ticker"] for r in db.query("SELECT ticker FROM favourites ORDER BY added_at")]


def list_favourites() -> list[str]:
    return [r["ticker"] for r in db.query("SELECT ticker FROM favourites ORDER BY added_at")]


def set_group_order(groups: list[str]) -> list[str]:
    for idx, group in enumerate(groups):
        db.execute(
            "INSERT INTO group_order (group_name, position) VALUES (?, ?) "
            "ON CONFLICT(group_name) DO UPDATE SET position = excluded.position",
            (group.strip().upper(), idx),
        )
    return groups


def available_groups() -> list[str]:
    user_groups = {r["group_name"] for r in db.query("SELECT DISTINCT group_name FROM user_instruments")}
    return GROUP_ORDER + sorted(user_groups - set(GROUP_ORDER))
