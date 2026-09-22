"""Static instrument universe for AYO MARKET MONITOR.

This is the single source of truth for the default worksheet. Nothing here
touches a network: it is pure configuration so that the shell and the table
skeleton can render before any market data arrives.

An instrument may belong to several groups (BAE Systems is both DEFENCE and
UK EQUITIES); the worksheet renders it under each, but data is fetched once
per unique ``ticker``.

``synthetic=True`` marks a security we deliberately carry as a row with no
resolvable Yahoo symbol. It is never requested from the provider and always
reports ``UNAVAILABLE`` - we show the name rather than silently dropping it,
and we never invent a price for it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------

WATCHLIST = "WATCHLIST"
US_MEGA_CAP = "US MEGA CAP"
AI_SEMIS = "AI & SEMICONDUCTORS"
QUANTUM = "QUANTUM COMPUTING"
SPACE = "SPACE"
ENERGY = "ENERGY & NUCLEAR"
DEFENCE = "DEFENCE"
CRYPTO_EQUITIES = "CRYPTO EQUITIES"
BIOTECH = "BIOTECH"
HIGH_BETA = "HIGH BETA / GROWTH"
UK_EQUITIES = "UK EQUITIES"
EUROPEAN_EQUITIES = "EUROPEAN EQUITIES"
ASIA = "ASIA"
ETFS = "ETFS & FUNDS"
INDICES = "INDICES"
CRYPTO = "CRYPTO"
COMMODITIES = "COMMODITIES"

#: Display order of the worksheet sections.
GROUP_ORDER: list[str] = [
    WATCHLIST,
    US_MEGA_CAP,
    AI_SEMIS,
    QUANTUM,
    SPACE,
    ENERGY,
    DEFENCE,
    CRYPTO_EQUITIES,
    BIOTECH,
    HIGH_BETA,
    UK_EQUITIES,
    EUROPEAN_EQUITIES,
    ASIA,
    ETFS,
    INDICES,
    CRYPTO,
    COMMODITIES,
]

#: Short region/theme tags used by the shortcut filters and the heatmap.
REGION_US = "US"
REGION_UK = "UK"
REGION_EU = "EUROPE"
REGION_ASIA = "ASIA"
REGION_GLOBAL = "GLOBAL"


@dataclass(frozen=True)
class Instrument:
    ticker: str
    name: str
    groups: tuple[str, ...]
    asset_class: str = "EQUITY"  # EQUITY | ETF | FUND | INDEX | CRYPTO | COMMODITY
    region: str = REGION_US
    tags: tuple[str, ...] = ()
    #: Currency hint used only until the provider reports the native currency.
    currency_hint: str | None = None
    #: Carried as a row but never requested (no resolvable Yahoo symbol).
    synthetic: bool = False
    #: Operator-facing caveat surfaced in the UI tooltip.
    note: str | None = None
    aliases: tuple[str, ...] = field(default=())

    @property
    def id(self) -> str:
        return self.ticker


def _i(ticker: str, name: str, groups: Iterable[str], **kw) -> Instrument:
    return Instrument(ticker=ticker, name=name, groups=tuple(groups), **kw)


DEFAULT_INSTRUMENTS: list[Instrument] = [
    # ---------------------------------------------------------------- mega cap
    _i("AAPL", "Apple", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("MSFT", "Microsoft", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("GOOGL", "Alphabet", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("AMZN", "Amazon", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("META", "Meta Platforms", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("TSLA", "Tesla", [US_MEGA_CAP], tags=("AI",), currency_hint="USD"),
    _i("AVGO", "Broadcom", [US_MEGA_CAP, AI_SEMIS], tags=("AI",), currency_hint="USD"),

    # ------------------------------------------------------ AI & semiconductors
    _i("NVDA", "NVIDIA", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("AMD", "Advanced Micro Devices", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("INTC", "Intel", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("QCOM", "Qualcomm", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("NXPI", "NXP Semiconductors", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("LRCX", "Lam Research", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("AXTI", "AXT Inc", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("SNDK", "SanDisk", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("CRWV", "CoreWeave", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("LITE", "Lumentum", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("IPGP", "IPG Photonics", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("PLTR", "Palantir", [AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i(
        "000660.KS",
        "SK Hynix",
        [AI_SEMIS, ASIA],
        region=REGION_ASIA,
        tags=("AI",),
        currency_hint="KRW",
    ),
    _i(
        "0020.HK",
        "SenseTime",
        [AI_SEMIS, ASIA],
        region=REGION_ASIA,
        tags=("AI",),
        currency_hint="HKD",
    ),
    _i(
        "CBRS",
        "Cerebras Systems",
        [AI_SEMIS],
        tags=("AI",),
        currency_hint="USD",
        note="Yahoo may not list this symbol; the row is retained and marked UNAVAILABLE if so.",
    ),

    # ------------------------------------------------------- quantum computing
    _i("IONQ", "IonQ", [QUANTUM], tags=("QUANTUM",), currency_hint="USD"),
    _i("QUBT", "Quantum Computing Inc", [QUANTUM], tags=("QUANTUM",), currency_hint="USD"),
    _i("RGTI", "Rigetti Computing", [QUANTUM], tags=("QUANTUM",), currency_hint="USD"),
    _i("QBTS", "D-Wave Quantum", [QUANTUM], tags=("QUANTUM",), currency_hint="USD"),

    # ------------------------------------------------------------------- space
    _i("RKLB", "Rocket Lab", [SPACE], tags=("SPACE",), currency_hint="USD"),
    _i(
        "SPCE",
        "Virgin Galactic",
        [SPACE],
        tags=("SPACE",),
        currency_hint="USD",
    ),
    _i("SIDU", "Sidus Space", [SPACE], tags=("SPACE",), currency_hint="USD"),

    # -------------------------------------------------------- energy & nuclear
    _i("CEG", "Constellation Energy", [ENERGY], tags=("ENERGY",), currency_hint="USD"),
    _i("SMR", "NuScale Power", [ENERGY], tags=("ENERGY",), currency_hint="USD"),
    _i("BE", "Bloom Energy", [ENERGY], tags=("ENERGY",), currency_hint="USD"),
    _i("ENPH", "Enphase Energy", [ENERGY], tags=("ENERGY",), currency_hint="USD"),
    _i("CSIQ", "Canadian Solar", [ENERGY], tags=("ENERGY",), currency_hint="USD"),
    _i(
        "IONR",
        "ioneer",
        [ENERGY],
        tags=("ENERGY",),
        currency_hint="USD",
        note="US-listed ADR of the Australian lithium developer.",
    ),

    # ----------------------------------------------------------------- defence
    _i("BA.L", "BAE Systems", [DEFENCE, UK_EQUITIES], region=REGION_UK,
       tags=("DEFENCE",), currency_hint="GBp"),
    _i("RHM.DE", "Rheinmetall", [DEFENCE, EUROPEAN_EQUITIES], region=REGION_EU,
       tags=("DEFENCE",), currency_hint="EUR"),
    _i("HAG.DE", "Hensoldt", [DEFENCE, EUROPEAN_EQUITIES], region=REGION_EU,
       tags=("DEFENCE",), currency_hint="EUR"),
    _i("LDO.MI", "Leonardo", [DEFENCE, EUROPEAN_EQUITIES], region=REGION_EU,
       tags=("DEFENCE",), currency_hint="EUR"),
    _i("PWR", "Quanta Services", [DEFENCE], tags=("DEFENCE",), currency_hint="USD"),

    # --------------------------------------------------------- crypto equities
    _i("COIN", "Coinbase", [CRYPTO_EQUITIES], tags=("CRYPTO",), currency_hint="USD"),
    _i("MSTR", "Strategy", [CRYPTO_EQUITIES], tags=("CRYPTO",), currency_hint="USD"),
    _i("BITF", "Bitfarms", [CRYPTO_EQUITIES], tags=("CRYPTO",), currency_hint="USD"),
    _i("CRCL", "Circle Internet Group", [CRYPTO_EQUITIES], tags=("CRYPTO",), currency_hint="USD"),

    # ----------------------------------------------------------------- biotech
    _i("NVAX", "Novavax", [BIOTECH], currency_hint="USD"),
    _i("MNMD", "MindMed", [BIOTECH], currency_hint="USD"),
    _i("NGENF", "NervGen Pharma", [BIOTECH], currency_hint="USD",
       note="OTC-quoted; liquidity and data coverage are thin."),
    _i("VERU", "Veru", [BIOTECH], currency_hint="USD"),
    _i("ABSI", "Absci", [BIOTECH], tags=("AI",), currency_hint="USD"),
    _i("ORGO", "Organogenesis", [BIOTECH], currency_hint="USD"),
    _i("MRNA", "Moderna", [BIOTECH], currency_hint="USD"),
    _i(
        "LBPH",
        "Longboard Pharmaceuticals",
        [BIOTECH],
        currency_hint="USD",
        note="Acquired/delisted - retained as a historical row.",
    ),
    _i(
        "INSILICO",
        "Insilico Medicine",
        [BIOTECH],
        tags=("AI",),
        synthetic=True,
        note="Privately held - no Yahoo Finance symbol. Retained as UNAVAILABLE.",
    ),

    # -------------------------------------------------------- high beta/growth
    _i("HOOD", "Robinhood", [HIGH_BETA], currency_hint="USD"),
    _i("UPST", "Upstart", [HIGH_BETA], tags=("AI",), currency_hint="USD"),
    _i("BYND", "Beyond Meat", [HIGH_BETA], currency_hint="USD"),
    _i("LCID", "Lucid", [HIGH_BETA], currency_hint="USD"),
    _i("RBLX", "Roblox", [HIGH_BETA], currency_hint="USD"),
    _i("NIO", "NIO", [HIGH_BETA, ASIA], region=REGION_ASIA, currency_hint="USD"),
    _i("AMPX", "Amprius Technologies", [HIGH_BETA], tags=("ENERGY",), currency_hint="USD"),
    _i("VRT", "Vertiv", [HIGH_BETA, AI_SEMIS], tags=("AI",), currency_hint="USD"),
    _i("BYD", "Boyd Gaming", [HIGH_BETA], currency_hint="USD"),
    _i(
        "NKLA",
        "Nikola",
        [HIGH_BETA],
        currency_hint="USD",
        note="Bankruptcy/delisting - Yahoo coverage may have ended.",
    ),

    # ------------------------------------------------------------ UK equities
    _i("RR.L", "Rolls-Royce Holdings", [UK_EQUITIES], region=REGION_UK,
       tags=("DEFENCE",), currency_hint="GBp"),
    _i("JET2.L", "Jet2", [UK_EQUITIES], region=REGION_UK, currency_hint="GBp"),
    _i("FRES.L", "Fresnillo", [UK_EQUITIES], region=REGION_UK, currency_hint="GBp"),
    _i("IKA.L", "Ilika", [UK_EQUITIES], region=REGION_UK, tags=("ENERGY",), currency_hint="GBp"),
    _i("NFG.L", "Next 15 Group", [UK_EQUITIES], region=REGION_UK, currency_hint="GBp"),

    # ------------------------------------------------------------------- ETFs
    _i("VOO", "Vanguard S&P 500 ETF", [ETFS], asset_class="ETF", currency_hint="USD"),
    _i("VUSA.L", "Vanguard S&P 500 UCITS ETF", [ETFS], asset_class="ETF",
       region=REGION_UK, currency_hint="GBP"),
    _i("SPYD", "SPDR Portfolio S&P 500 High Dividend ETF", [ETFS],
       asset_class="ETF", currency_hint="USD"),
    _i("REMX", "VanEck Rare Earth/Strategic Metals ETF", [ETFS],
       asset_class="ETF", currency_hint="USD"),
    _i("AIEQ", "Amplify AI Powered Equity ETF", [ETFS], asset_class="ETF",
       tags=("AI",), currency_hint="USD"),
    _i("HAPI", "Harbor Human Capital Factor ETF", [ETFS], asset_class="ETF", currency_hint="USD"),
    _i("DFNS", "VanEck Defense ETF", [ETFS], asset_class="ETF",
       tags=("DEFENCE",), currency_hint="USD"),
    _i("CMOD.L", "Invesco Bloomberg Commodity UCITS ETF", [ETFS], asset_class="ETF",
       region=REGION_UK, currency_hint="USD", aliases=("CMOD",)),
    _i("AQRTX", "AQR Multi-Asset Fund", [ETFS], asset_class="FUND", currency_hint="USD",
       note="Open-ended mutual fund - NAV only, no intraday price or volume."),
    _i("ARKVX", "ARK Venture Fund", [ETFS], asset_class="FUND", currency_hint="USD",
       note="Interval fund - NAV only, no intraday price or volume."),

    # ---------------------------------------------------------------- indices
    _i("^GSPC", "S&P 500", [INDICES], asset_class="INDEX", currency_hint="USD"),
    _i("^NDX", "NASDAQ 100", [INDICES], asset_class="INDEX", currency_hint="USD"),
    _i("^DJI", "Dow Jones Industrial Average", [INDICES], asset_class="INDEX", currency_hint="USD"),
    _i("^FTSE", "FTSE 100", [INDICES], asset_class="INDEX", region=REGION_UK, currency_hint="GBP"),
    _i("^FTMC", "FTSE 250", [INDICES], asset_class="INDEX", region=REGION_UK, currency_hint="GBP"),
    _i("^GDAXI", "DAX", [INDICES], asset_class="INDEX", region=REGION_EU, currency_hint="EUR"),
    _i("^FCHI", "CAC 40", [INDICES], asset_class="INDEX", region=REGION_EU, currency_hint="EUR"),
    _i("^N225", "Nikkei 225", [INDICES], asset_class="INDEX", region=REGION_ASIA, currency_hint="JPY"),
    _i("^HSI", "Hang Seng", [INDICES], asset_class="INDEX", region=REGION_ASIA, currency_hint="HKD"),

    # ----------------------------------------------------------------- crypto
    _i("BTC-USD", "Bitcoin", [CRYPTO], asset_class="CRYPTO",
       region=REGION_GLOBAL, tags=("CRYPTO",), currency_hint="USD"),
    _i("ETH-USD", "Ethereum", [CRYPTO], asset_class="CRYPTO",
       region=REGION_GLOBAL, tags=("CRYPTO",), currency_hint="USD"),
    _i("SOL-USD", "Solana", [CRYPTO], asset_class="CRYPTO",
       region=REGION_GLOBAL, tags=("CRYPTO",), currency_hint="USD"),
    _i("XRP-USD", "XRP", [CRYPTO], asset_class="CRYPTO",
       region=REGION_GLOBAL, tags=("CRYPTO",), currency_hint="USD"),
    _i("ADA-USD", "Cardano", [CRYPTO], asset_class="CRYPTO",
       region=REGION_GLOBAL, tags=("CRYPTO",), currency_hint="USD"),

    # ------------------------------------------------------------ commodities
    _i("GC=F", "Gold", [COMMODITIES], asset_class="COMMODITY", region=REGION_GLOBAL,
       currency_hint="USD"),
    _i("SI=F", "Silver", [COMMODITIES], asset_class="COMMODITY", region=REGION_GLOBAL,
       currency_hint="USD"),
    _i("HG=F", "Copper", [COMMODITIES], asset_class="COMMODITY", region=REGION_GLOBAL,
       currency_hint="USD"),
    _i("CL=F", "WTI Crude", [COMMODITIES], asset_class="COMMODITY", region=REGION_GLOBAL,
       currency_hint="USD"),
    _i("NG=F", "Natural Gas", [COMMODITIES], asset_class="COMMODITY", region=REGION_GLOBAL,
       currency_hint="USD"),
]

INSTRUMENTS_BY_TICKER: dict[str, Instrument] = {i.ticker: i for i in DEFAULT_INSTRUMENTS}

#: Tickers shown in the market tape under the navigation bar.
MARKET_STRIP_TICKERS: list[str] = [
    "^GSPC",
    "^NDX",
    "^DJI",
    "^FTSE",
    "^GDAXI",
    "^N225",
    "GC=F",
    "CL=F",
    "BTC-USD",
    "ETH-USD",
]


def all_tickers(include_synthetic: bool = False) -> list[str]:
    return [
        i.ticker
        for i in DEFAULT_INSTRUMENTS
        if include_synthetic or not i.synthetic
    ]


def get_instrument(ticker: str) -> Instrument | None:
    return INSTRUMENTS_BY_TICKER.get(ticker)


def search_default_universe(query: str, limit: int = 20) -> list[Instrument]:
    """Substring search over the built-in universe (ticker, name, aliases)."""
    q = query.strip().lower()
    if not q:
        return []
    scored: list[tuple[int, Instrument]] = []
    for inst in DEFAULT_INSTRUMENTS:
        haystacks = [inst.ticker.lower(), inst.name.lower(), *(a.lower() for a in inst.aliases)]
        best: int | None = None
        for idx, hay in enumerate(haystacks):
            if hay == q:
                score = 0
            elif hay.startswith(q):
                score = 1 + idx
            elif q in hay:
                score = 5 + idx
            else:
                continue
            best = score if best is None else min(best, score)
        if best is not None:
            scored.append((best, inst))
    scored.sort(key=lambda t: (t[0], t[1].ticker))
    return [i for _, i in scored[:limit]]
