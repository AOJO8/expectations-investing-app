"""AYO MARKET MONITOR - FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api.routes import VERSION, router
from .core import db
from .core.config import settings
from .data.providers import get_provider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("ayo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    provider = get_provider()
    logger.info(
        "AYO MARKET MONITOR %s starting - provider=%s synthetic=%s db=%s",
        VERSION,
        provider.name,
        provider.is_synthetic,
        settings.database_path,
    )
    if provider.is_synthetic:
        logger.warning("SYNTHETIC DATA MODE - responses are flagged and must not be read as market data")
    yield
    logger.info("AYO MARKET MONITOR shutting down")


app = FastAPI(
    title="AYO MARKET MONITOR",
    description=(
        "Multi-asset market monitoring API. Market data is sourced from Yahoo Finance "
        "and is delayed; nothing here is investment advice."
    ),
    version=VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root() -> dict:
    return {
        "name": "AYO MARKET MONITOR",
        "version": VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    """Never leak a stack trace; the worksheet degrades rather than breaks."""
    logger.exception("unhandled error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "internal error", "path": str(request.url.path)},
    )
