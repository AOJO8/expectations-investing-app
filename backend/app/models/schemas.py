"""Pydantic request/response models.

Response payloads are intentionally permissive (``extra='allow'``) so new
derived fields do not require a schema migration, but every request body is
strict.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class QuotesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tickers: list[str] = Field(default_factory=list, max_length=250)


class WatchlistCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=48)


class WatchlistPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=48)
    position: int | None = None


class WatchlistInstrumentAdd(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str = Field(min_length=1, max_length=24)
    name: str | None = Field(default=None, max_length=120)
    group: str | None = Field(default=None, max_length=48)
    asset_class: str = Field(default="EQUITY", max_length=24)
    region: str = Field(default="US", max_length=24)
    validate_symbol: bool = True


class FavouriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str = Field(min_length=1, max_length=24)
    favourite: bool = True


class MoveGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str = Field(min_length=1, max_length=24)
    group: str = Field(min_length=1, max_length=48)


class GroupOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    groups: list[str]


class HealthResponse(BaseModel):
    status: str
    provider: str
    is_synthetic_source: bool
    version: str
    cache: dict
    instruments: int
