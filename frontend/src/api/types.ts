/** Shapes returned by the AYO backend. */

export type DataStatus =
  | 'OK'
  | 'DELAYED'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'DELISTED'
  | 'NO_HISTORY'
  | 'ERROR'

export type TrendLabel =
  | 'STRONG UPTREND'
  | 'UPTREND'
  | 'NEUTRAL'
  | 'DOWNTREND'
  | 'STRONG DOWNTREND'

export type SignalLabel = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG SELL'

export interface ScoreComponent {
  key: string
  label: string
  points: number
  detail: string
}

export interface TechnicalScore {
  score: number
  max_score: number
  signal: SignalLabel
  components: ScoreComponent[]
  disclaimer: string
}

/** One worksheet row: quote fields are always present, technicals hydrate later. */
export interface SecurityRow {
  ticker: string
  name: string
  asset_class: string
  region: string | null
  groups: string[]
  tags: string[]
  currency: string | null
  status: DataStatus
  status_message: string | null
  data_source: string
  is_synthetic_source: boolean
  updated_at: string
  note?: string | null
  session_date?: string | null

  last: number | null
  previous_close?: number | null
  change: number | null
  change_pct: number | null
  open?: number | null
  day_high?: number | null
  day_low?: number | null
  volume?: number | null
  market_cap?: number | null
  average_volume?: number | null
  beta?: number | null
  trailing_pe?: number | null
  forward_pe?: number | null
  price_to_book?: number | null
  dividend_yield?: number | null
  sector?: string | null
  industry?: string | null
  exchange?: string | null

  is_favourite?: boolean
  in_watchlist?: boolean
  technicals_loaded: boolean

  // Hydrated in stage=full
  rsi14?: number | null
  rsi_zone?: string | null
  macd?: number | null
  macd_signal?: number | null
  macd_histogram?: number | null
  macd_direction?: 'RISING' | 'FALLING' | 'FLAT' | null
  macd_state?: 'BULLISH' | 'BEARISH' | 'FLAT' | null
  macd_cross_up?: boolean
  macd_cross_down?: boolean
  sma20?: number | null
  sma50?: number | null
  sma200?: number | null
  ema20?: number | null
  ema50?: number | null
  sma50_distance_pct?: number | null
  sma200_distance_pct?: number | null
  above_sma50?: boolean | null
  above_sma200?: boolean | null
  ma_structure?: 'BULLISH' | 'BEARISH' | 'MIXED' | null
  ma_cross?: 'GOLDEN_CROSS' | 'DEATH_CROSS' | null
  trend?: TrendLabel | null
  atr14?: number | null
  volatility_20d?: number | null
  relative_volume?: number | null
  average_volume_20d?: number | null
  return_1w?: number | null
  return_1m?: number | null
  return_3m?: number | null
  return_1y?: number | null
  return_ytd?: number | null
  high_52w?: number | null
  low_52w?: number | null
  from_52w_high_pct?: number | null
  from_52w_low_pct?: number | null
  technical_score?: TechnicalScore | null
  technical_signal?: SignalLabel | null
  sparkline?: number[] | null
  sparkline_change_pct?: number | null
  sessions?: number
}

export interface Breadth {
  advancing: number
  declining: number
  unchanged: number
  priced: number
  total: number
  pct_above_sma50: number | null
  pct_above_sma200: number | null
  sample_sma50: number
  sample_sma200: number
}

export interface MarketSnapshot {
  rows: SecurityRow[]
  groups: { name: string; position: number }[]
  stage: 'quotes' | 'full'
  as_of: string
  data_source: string
  is_synthetic_source: boolean
  is_delayed: boolean
  disclaimer: string
  counts: Record<string, number>
  breadth: Breadth
  provider_circuit?: ProviderCircuit
}

export interface ProviderCircuit {
  open: boolean
  consecutive_failures: number
  cooldown_seconds: number
  reopens_in: number
}

export interface StripItem extends SecurityRow {
  short_name: string
}

export interface Candle {
  t: string
  o: number | null
  h: number | null
  l: number | null
  c: number | null
  v: number | null
}

export interface HistoryResponse {
  ticker: string
  period: string
  interval: string
  status: DataStatus
  candles: Candle[]
  message?: string
}

export interface SearchResult {
  ticker: string
  name: string
  asset_class?: string
  region?: string
  exchange?: string
  in_universe: boolean
  source: string
  requires_validation?: boolean
}

export interface Watchlist {
  id: number
  name: string
  is_default: boolean
  position: number
  instruments: { ticker: string; position: number; added_at: string }[]
}

export interface WatchlistsResponse {
  watchlists: Watchlist[]
  favourites: string[]
}

export interface InstrumentsResponse {
  instruments: {
    ticker: string
    name: string
    groups: string[]
    asset_class: string
    region: string
    tags: string[]
    currency_hint: string | null
    synthetic: boolean
    note: string | null
    is_favourite: boolean
  }[]
  groups: { name: string; position: number }[]
  group_catalogue: string[]
  default_group_order: string[]
}

export interface HealthResponse {
  status: string
  provider: string
  is_synthetic_source: boolean
  version: string
  cache: { entries: number; fresh: number; stale: number }
  instruments: number
  provider_circuit?: ProviderCircuit
}
