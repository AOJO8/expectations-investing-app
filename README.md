# AYO MARKET MONITOR

A Bloomberg-inspired, multi-asset securities worksheet: a dense institutional
market monitor built to stay open all day and answer, at a glance, what is
moving, what has unusual volume, what is overbought or oversold, and what has
changed since you last looked.

Market data comes from Yahoo Finance via `yfinance`. **It is delayed**, and
nothing in this application is investment advice.

```
┌─────────────────────────────────────────────────────────────────────┐
│ AYO MARKET MONITOR   MULTI-ASSET WORKSPACE      ● US OPEN  AUTO 1M  │
├─────────────────────────────────────────────────────────────────────┤
│ MONITOR │ CHARTS │ HEATMAP │ TECHNICALS                             │
│ S&P 500 6,812.40 +0.38%   FTSE 100 ...   GOLD ...   BTC ...         │
├──────────────────────────────────────────────────┬──────────────────┤
│ ▼ QUANTUM COMPUTING (4)                  ▲ 3 ▼ 1 │ BREADTH          │
│   IonQ        IONQ   45.21  +1.84  +4.24% ▁▂▄▆█  │ ▲ 38  ▼ 21  — 3  │
│   ...                                            │ SMA50      63%   │
└──────────────────────────────────────────────────┴──────────────────┘
```

---

## Contents

- [Architecture](#architecture)
- [Install](#install)
- [Run the backend](#run-the-backend)
- [Run the frontend](#run-the-frontend)
- [Tests](#tests)
- [Data source and its limitations](#data-source-and-its-limitations)
- [How instrument mapping works](#how-instrument-mapping-works)
- [Adding a security](#adding-a-security)
- [How the technical signals are calculated](#how-the-technical-signals-are-calculated)
- [API reference](#api-reference)
- [Caching and failure handling](#caching-and-failure-handling)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Configuration](#configuration)

---

## Architecture

A monorepo with a strict boundary between market data and presentation.

```
backend/
  app/
    main.py                     FastAPI app, CORS, lifespan, error handling
    api/routes.py               HTTP surface only - no pandas, no yfinance
    models/schemas.py           pydantic request/response models
    core/
      config.py                 environment-driven settings
      cache.py                  TTL cache with explicit stale-serve
      circuit.py                circuit breaker for a failing provider
      db.py                     SQLite schema and connection handling
    data/
      instruments.py            the instrument universe (pure configuration)
      providers/
        base.py                 provider protocol
        yfinance_provider.py    THE ONLY module that imports yfinance
        fixture_provider.py     offline dev/test provider (never default)
    services/
      indicators.py             RSI, MACD, SMA/EMA, ATR, volatility, returns
      scoring.py                trend classifier + calculate_technical_score()
      market_data.py            MarketDataService - the orchestration point
      watchlists.py             watchlist/favourite persistence
  tests/                        148 tests
frontend/
  src/
    api/                        typed client + response types
    lib/                        formatting, heat ramp, filter/expression engine
    hooks/                      settings, staged market loading, price ticks
    components/                 header, worksheet, cells, drawer, charts
    views/                      charts, heatmap, technicals scanner
app.py                          the pre-existing Streamlit expectations-investing
                                tool, left untouched
```

**The layering rule:** routes never touch a DataFrame, components never touch
a data provider, and indicator maths has no I/O at all. Swapping data vendors
means writing one new provider module; nothing else changes.

**Tech:** React 18 + TypeScript + Vite + Tailwind + TanStack Table/Query/Virtual
+ lightweight-charts + Lucide. Python 3.11 + FastAPI + yfinance + pandas +
numpy + pydantic + SQLite.

---

## Install

Requires Python 3.11+ and Node 18+.

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install
```

## Run the backend

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

- API root: http://127.0.0.1:8000
- Interactive docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/health

## Run the frontend

```bash
cd frontend
npm run dev     # http://127.0.0.1:5173
```

Vite proxies `/api` to `http://127.0.0.1:8000`, so both servers just work
together. Point somewhere else with `AYO_API_URL=http://host:port npm run dev`,
or build for production with `npm run build` and serve `frontend/dist` behind
any static host.

### Offline / demo mode

If Yahoo Finance is unreachable (an air-gapped machine, CI, a restrictive
network), the backend can serve a deterministic synthetic provider:

```bash
AYO_PROVIDER=fixture .venv/bin/python -m uvicorn app.main:app --port 8000
```

**This is not market data.** It exists to exercise the UI and the test suite.
Every response carries `is_synthetic_source: true`, and the UI shows a
permanent red banner. It is never enabled by default.

---

## Tests

```bash
backend/.venv/bin/python -m pytest backend/tests -q     # 148 tests
cd frontend && npm run typecheck && npm run build
```

Backend coverage includes:

| Area | What is verified |
|---|---|
| RSI | Matches Wilder's published worked example (70.46, 66.25) and an independent recursive reference implementation to 1e-9 |
| MACD | Histogram equals MACD − signal; crosses detected on the crossing bar; matches a manual EMA difference |
| Returns | The nearest *previous* trading session is used across weekends and holidays; a window longer than the available history returns nothing |
| Relative volume | Current bar excluded from its own baseline; zero baseline returns nothing |
| ATR / volatility | Wilder seeding; annualisation by √252 |
| Technical score | Every band, the sum-of-components invariant, and that partial data cannot produce an extreme label |
| Trend classifier | All five states plus insufficient-data handling |
| Failure handling | An invalid ticker, a partially failing batch and a totally dead provider all still return a full worksheet |
| Circuit breaker | Opens on a run of failures, half-opens after the cooldown, and never re-requests a symbol twice in one pass |

---

## Data source and its limitations

Yahoo Finance is the sole source, through `yfinance`. Be aware:

- **Quotes are delayed.** Typically ~15 minutes for US equities, and longer on
  some venues. The app labels every row `DELAYED` rather than implying real time.
- **It is an unofficial, undocumented endpoint.** It rate limits, changes
  shape without notice, and occasionally returns partial or empty frames.
- **Coverage is uneven.** Mutual funds (`AQRTX`, `ARKVX`) are NAV-only with no
  intraday price or volume. OTC lines are thin. Some symbols do not exist at all.
- **Fundamentals are best-effort.** `.info` fields are frequently missing. A
  field Yahoo does not return renders as `—`; it is never substituted, inferred
  or defaulted to zero.
- **`dividendYield` is ambiguous** — Yahoo has served it both as a fraction and
  as a percentage across `yfinance` releases. The provider prefers
  `trailingAnnualDividendYield`, which is consistently a fraction, and only
  rescales values that are unambiguously percentages.
- **Delisted names stay.** `LBPH` and `NKLA` remain as rows marked `DELISTED`
  rather than vanishing from the worksheet.
- **Some securities have no symbol at all.** Insilico Medicine is privately
  held; it is carried as a permanently `UNAVAILABLE` row so the name is not
  silently dropped.

No price is ever estimated, interpolated or randomised. If the data is not
there, the cell shows an em dash and the row carries a status explaining why.

---

## How instrument mapping works

`backend/app/data/instruments.py` is the single source of truth. It is pure
configuration and touches no network, so the app shell and table skeleton
render before any data arrives.

```python
Instrument(
    ticker="BA.L",                          # the Yahoo symbol
    name="BAE Systems",
    groups=("DEFENCE", "UK EQUITIES"),      # may appear in several sections
    asset_class="EQUITY",                   # EQUITY|ETF|FUND|INDEX|CRYPTO|COMMODITY
    region="UK",                            # drives the US/UK/EUROPE filters
    tags=("DEFENCE",),                      # drives the theme filters
    currency_hint="GBp",                    # until the provider reports one
)
```

Notes on the fields:

- **`groups`** — an instrument can belong to more than one section. BAE Systems
  appears under both DEFENCE and UK EQUITIES; the data is fetched once and
  rendered in each.
- **`currency_hint`** — a placeholder only. The provider's native currency wins
  once metadata loads, so nothing is forced to USD. London lines quote in
  `GBp` (pence) and are formatted as `123.40p`, distinct from `GBP`.
- **`synthetic=True`** — carry a row for a security with no resolvable symbol.
  It is never requested and always reports `UNAVAILABLE`.
- **`note`** — an operator-facing caveat, surfaced in the UI as an ⓘ tooltip.

Section order is `GROUP_ORDER`; the market tape is `MARKET_STRIP_TICKERS`.

## Adding a security

**From the UI** — press `/`, type a ticker or company name, pick the group in
the *ADD TO* selector and press Enter. The symbol is validated against the
provider, stored in SQLite, and appears in the worksheet immediately. A symbol
that never resolves is still kept, marked `UNAVAILABLE` — an imperfect symbol
search never blocks you.

**Permanently, in the default universe** — add an `Instrument(...)` to
`DEFAULT_INSTRUMENTS` in `backend/app/data/instruments.py` and restart. If it
belongs to a new section, add that name to `GROUP_ORDER` too.

**Via the API**

```bash
curl -X POST localhost:8000/api/watchlists/1/instruments \
     -H 'Content-Type: application/json' \
     -d '{"ticker": "SOFI", "group": "WATCHLIST"}'
```

---

## How the technical signals are calculated

All of it lives in `services/indicators.py` (maths) and `services/scoring.py`
(classification). Both are pure functions and directly unit-tested.

### Indicators

| Metric | Definition |
|---|---|
| **RSI 14** | Wilder's smoothing. The first average is the *simple mean* of the first 14 gains/losses, then `avg += (x − avg) / 14`. Seeding with the first observation instead — what a bare `ewm()` does — is a common bug and is guarded by a regression test. |
| **MACD** | `EMA(12) − EMA(26)`; signal is `EMA(9)` of MACD; histogram is their difference. A cross is flagged on the bar where the sign of `macd − signal` flips. |
| **SMA / EMA** | 20/50/200 simple; 20/50 exponential with `α = 2/(n+1)`. |
| **ATR 14** | True range (including gaps) under Wilder's smoothing. |
| **20D volatility** | Standard deviation of the last 20 daily log returns, annualised by `√252`, in percent. |
| **Relative volume** | Session volume ÷ mean of the **previous** 20 sessions. The current bar is excluded so an unusual print cannot dilute its own signal. |
| **Returns** | 1W/1M/3M/YTD/1Y on adjusted close. Calendar dates are never indexed naively: the window start walks back to the nearest *prior* trading session. A window the history does not cover returns nothing rather than a shorter-period return in disguise. |

### MA structure

`BULLISH` when price > SMA50 > SMA200, `BEARISH` when price < SMA50 < SMA200,
otherwise `MIXED`. A golden or death cross within the last 10 sessions is
flagged separately as `GC` / `DC`.

### Trend classifier

| Label | Rule |
|---|---|
| `STRONG UPTREND` | price > SMA20 > SMA50 > SMA200 **and** MACD histogram > 0 |
| `STRONG DOWNTREND` | price < SMA20 < SMA50 < SMA200 **and** MACD histogram < 0 |
| `UPTREND` | the full stack without MACD confirmation, or price above both SMA50 and SMA200 |
| `DOWNTREND` | the mirror image |
| `NEUTRAL` | anything else, or not enough data |

### Technical signal

`calculate_technical_score()` scores five independent inputs in `[-2, +2]` for
a total in `[-10, +10]`.

| Input | +2 | +1 | 0 | −1 | −2 |
|---|---|---|---|---|---|
| RSI 14 | ≤ 30 | ≤ 45 | 45–55 | 55–70 | ≥ 70 |
| MACD | histogram > 0 **and** MACD > signal | histogram > 0 | flat | histogram < 0 | histogram < 0 **and** MACD < signal |
| Price vs SMA50 | above | — | at | — | below |
| Price vs SMA200 | above | — | at | — | below |
| 1M return | ≥ +10% | > 0 | flat | < 0 | ≤ −10% |

Then: `≥ +6` **STRONG BUY**, `≥ +2` **BUY**, `≤ −6` **STRONG SELL**,
`≤ −2` **SELL**, otherwise **NEUTRAL**.

An input that is unavailable scores **zero and says so**, so a thinly covered
security drifts toward NEUTRAL rather than toward a confident label. The API
returns every scored component with its reasoning, and the UI tooltip shows
that working — you can always see why a label was produced.

> These are rules-based descriptions of past prices. They are **not investment
> advice** and do not predict future returns.

---

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status, provider, cache and circuit-breaker state |
| `GET` | `/api/market?stage=quotes\|full` | The worksheet. `quotes` is the fast first paint; `full` adds technicals |
| `GET` | `/api/instruments` | The static universe — available before any market data |
| `GET` | `/api/strip` | Market tape entries |
| `GET` | `/api/quote/{ticker}` | One security |
| `POST` | `/api/quotes` | Many securities `{"tickers": [...]}` |
| `GET` | `/api/history/{ticker}?period=&interval=` | OHLCV candles |
| `GET` | `/api/technicals/{ticker}` | Full technical payload with score breakdown |
| `GET` | `/api/search?q=` | Universe search, provider search, and direct symbol entry |
| `GET` `POST` | `/api/watchlists` | List / create |
| `PATCH` `DELETE` | `/api/watchlists/{id}` | Rename, reorder, delete |
| `POST` | `/api/watchlists/{id}/instruments` | Add a security |
| `DELETE` | `/api/watchlists/{id}/instruments/{ticker}` | Remove a security |
| `POST` | `/api/favourites` | Star / unstar |
| `POST` | `/api/instruments/move` | Move a security to another section |
| `POST` | `/api/groups/order` | Persist section order |

Symbols containing `^`, `=` or `.` (`^GSPC`, `GC=F`, `BA.L`) are handled
correctly on every path.

---

## Caching and failure handling

**TTLs:** quotes 60s · recent history 300s · technicals 300s · long history
1800s · metadata 24h (also persisted in SQLite, so a restart does not
re-hammer Yahoo).

**Stale-serve:** if a refresh fails but a cached value exists, the cached value
is served and the row is marked `STALE` — visibly, with a tooltip saying it is
not current.

**Per-instrument isolation:** this is the load-bearing guarantee. One bad
ticker can never fail `/api/market`. Every instrument resolves independently to
one of:

| Status | Meaning |
|---|---|
| `OK` | Fresh data from the provider |
| `DELAYED` | Fresh, but the feed itself is delayed (Yahoo equities) |
| `STALE` | Served from cache after a failed refresh |
| `UNAVAILABLE` | The provider returned nothing for this symbol |
| `DELISTED` | Appears to have stopped trading; retained for reference |
| `NO_HISTORY` | A price exists, but too little history for the technicals |
| `ERROR` | An unexpected failure building this row |

**Circuit breaker:** when Yahoo is unreachable, naively retrying every symbol
turns one network failure into hundreds of doomed requests. Measured against a
blocked endpoint, a cold snapshot issued 402 attempts and took over two
minutes. The breaker trips after three consecutive failures and fails fast for
60 seconds, then allows a probe through. The same snapshot now takes 34s cold
and 12ms while open — and the UI explains the outage instead of hanging.

**Staged loading:** the shell renders first, then the quote snapshot paints the
table, then technicals hydrate in the background. Un-hydrated cells shimmer;
cells that are known-unavailable show an em dash rather than shimmering forever.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | Security search |
| `R` | Refresh |
| `F` | Favourites only |
| `↑` `↓` | Move between rows |
| `Enter` | Open the detail drawer for the selected row |
| `Esc` | Close the drawer, search or settings |

Auto-refresh (off / 30s / 1m / 5m, default 1m) never wipes table state:
sorting, filters, collapsed sections, selection and scroll position all survive.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AYO_PROVIDER` | `yfinance` | `fixture` for the offline synthetic provider |
| `AYO_DB_PATH` | `backend/data/ayo.db` | SQLite location |
| `AYO_CORS_ORIGINS` | `http://localhost:5173,…` | Comma-separated origins |
| `AYO_TTL_QUOTES` | `60` | Quote cache seconds |
| `AYO_TTL_TECHNICALS` | `300` | Technical cache seconds |
| `AYO_TTL_HISTORY_RECENT` | `300` | Short-window history seconds |
| `AYO_TTL_HISTORY_LONG` | `1800` | Long-window history seconds |
| `AYO_TTL_METADATA` | `86400` | Reference-data cache seconds |
| `AYO_MAX_STALE` | `43200` | How stale a fallback value may be |
| `AYO_METADATA_WORKERS` | `8` | Threads for per-symbol metadata |

**Persistence split:** SQLite holds watchlists, user-added tickers, favourites
and section order. `localStorage` holds per-browser layout — column widths,
visibility and order, density, collapsed sections and the refresh interval.

---

## A note on the Streamlit app

`app.py` at the repository root is the pre-existing expectations-investing
tool. It is a separate program, untouched by this work, and still runs with
`streamlit run app.py`.

---

## Disclaimer

For information only. Market data is delayed and may be inaccurate or
incomplete. The technical classifications are deterministic rules applied to
past prices — they are not investment advice, not a recommendation to
transact, and not a prediction of future returns.
