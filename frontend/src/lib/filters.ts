/** Shortcut filters, free-text matching and the small expression language. */

import type { SecurityRow } from '../api/types'

export interface QuickFilter {
  id: string
  label: string
  group: 'STATE' | 'MOVE' | 'TECHNICAL' | 'THEME'
  predicate: (row: SecurityRow) => boolean
  hint?: string
}

const has = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v)

export const QUICK_FILTERS: QuickFilter[] = [
  { id: 'all', label: 'ALL', group: 'STATE', predicate: () => true },
  {
    id: 'gainers',
    label: 'GAINERS',
    group: 'MOVE',
    predicate: (r) => has(r.change_pct) && r.change_pct > 0,
  },
  {
    id: 'losers',
    label: 'LOSERS',
    group: 'MOVE',
    predicate: (r) => has(r.change_pct) && r.change_pct < 0,
  },
  {
    id: 'up3',
    label: '> +3%',
    group: 'MOVE',
    predicate: (r) => has(r.change_pct) && r.change_pct >= 3,
  },
  {
    id: 'down3',
    label: '< -3%',
    group: 'MOVE',
    predicate: (r) => has(r.change_pct) && r.change_pct <= -3,
  },
  {
    id: 'rsi-over',
    label: 'RSI > 70',
    group: 'TECHNICAL',
    predicate: (r) => has(r.rsi14) && r.rsi14 > 70,
    hint: 'Overbought by Wilder RSI(14)',
  },
  {
    id: 'rsi-under',
    label: 'RSI < 30',
    group: 'TECHNICAL',
    predicate: (r) => has(r.rsi14) && r.rsi14 < 30,
    hint: 'Oversold by Wilder RSI(14)',
  },
  {
    id: 'macd-bull',
    label: 'MACD BULLISH',
    group: 'TECHNICAL',
    predicate: (r) => r.macd_state === 'BULLISH',
  },
  {
    id: 'macd-bear',
    label: 'MACD BEARISH',
    group: 'TECHNICAL',
    predicate: (r) => r.macd_state === 'BEARISH',
  },
  {
    id: 'above-200',
    label: 'ABOVE SMA200',
    group: 'TECHNICAL',
    predicate: (r) => r.above_sma200 === true,
  },
  {
    id: 'below-200',
    label: 'BELOW SMA200',
    group: 'TECHNICAL',
    predicate: (r) => r.above_sma200 === false,
  },
  {
    id: 'rvol',
    label: 'HIGH REL VOLUME',
    group: 'TECHNICAL',
    predicate: (r) => has(r.relative_volume) && r.relative_volume >= 1.5,
    hint: 'Traded at least 1.5x its 20-day average volume',
  },
  {
    id: 'near-high',
    label: 'NEAR 52W HIGH',
    group: 'TECHNICAL',
    predicate: (r) => has(r.from_52w_high_pct) && r.from_52w_high_pct >= -5,
    hint: 'Within 5% of the 52-week high',
  },
  { id: 'us', label: 'US', group: 'THEME', predicate: (r) => r.region === 'US' },
  { id: 'uk', label: 'UK', group: 'THEME', predicate: (r) => r.region === 'UK' },
  { id: 'europe', label: 'EUROPE', group: 'THEME', predicate: (r) => r.region === 'EUROPE' },
  {
    id: 'quantum',
    label: 'QUANTUM',
    group: 'THEME',
    predicate: (r) => r.tags?.includes('QUANTUM') || r.groups?.includes('QUANTUM COMPUTING'),
  },
  {
    id: 'defence',
    label: 'DEFENCE',
    group: 'THEME',
    predicate: (r) => r.tags?.includes('DEFENCE') || r.groups?.includes('DEFENCE'),
  },
  { id: 'ai', label: 'AI', group: 'THEME', predicate: (r) => r.tags?.includes('AI') },
]

export const QUICK_FILTER_BY_ID = new Map(QUICK_FILTERS.map((f) => [f.id, f]))

// ---------------------------------------------------------------------------
// Expression filtering: `rsi < 30`, `change > 3`, `volume > 2x`
// ---------------------------------------------------------------------------

type Comparator = '<' | '<=' | '>' | '>=' | '=' | '=='

/** Field aliases accepted in expressions, mapped to a row accessor. */
const FIELDS: Record<string, (row: SecurityRow) => number | null | undefined> = {
  rsi: (r) => r.rsi14,
  rsi14: (r) => r.rsi14,
  change: (r) => r.change_pct,
  chg: (r) => r.change_pct,
  pct: (r) => r.change_pct,
  price: (r) => r.last,
  last: (r) => r.last,
  volume: (r) => r.relative_volume,
  rvol: (r) => r.relative_volume,
  relvol: (r) => r.relative_volume,
  macd: (r) => r.macd_histogram,
  hist: (r) => r.macd_histogram,
  beta: (r) => r.beta,
  atr: (r) => r.atr14,
  vol20: (r) => r.volatility_20d,
  volatility: (r) => r.volatility_20d,
  mcap: (r) => r.market_cap,
  cap: (r) => r.market_cap,
  sma50: (r) => r.sma50_distance_pct,
  sma200: (r) => r.sma200_distance_pct,
  score: (r) => r.technical_score?.score,
  w1: (r) => r.return_1w,
  m1: (r) => r.return_1m,
  m3: (r) => r.return_3m,
  y1: (r) => r.return_1y,
  ytd: (r) => r.return_ytd,
  high52: (r) => r.from_52w_high_pct,
}

export const EXPRESSION_FIELDS = Object.keys(FIELDS)

const EXPRESSION_RE = /^\s*([a-z0-9_]+)\s*(<=|>=|==|=|<|>)\s*(-?[\d.]+)\s*(x|%)?\s*$/i

export interface ParsedExpression {
  field: string
  comparator: Comparator
  value: number
}

export function parseExpression(input: string): ParsedExpression | null {
  const match = EXPRESSION_RE.exec(input)
  if (!match) return null
  const [, rawField, comparator, rawValue] = match
  const field = rawField.toLowerCase()
  if (!(field in FIELDS)) return null
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return null
  return { field, comparator: comparator as Comparator, value }
}

/** Multiple expressions can be combined with `and` / `&&` / a comma. */
export function parseExpressions(input: string): ParsedExpression[] | null {
  const parts = input.split(/\s+and\s+|&&|,/i).filter((p) => p.trim())
  if (!parts.length) return null
  const parsed = parts.map(parseExpression)
  return parsed.every((p): p is ParsedExpression => p !== null) ? parsed : null
}

function compare(actual: number, comparator: Comparator, expected: number): boolean {
  switch (comparator) {
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    default:
      return Math.abs(actual - expected) < 1e-9
  }
}

export function matchesExpressions(row: SecurityRow, expressions: ParsedExpression[]): boolean {
  return expressions.every((expr) => {
    const accessor = FIELDS[expr.field]
    const actual = accessor(row)
    if (!has(actual)) return false
    return compare(actual, expr.comparator, expr.value)
  })
}

/** Plain-text match across ticker, name, sector and group. */
export function matchesText(row: SecurityRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    row.ticker.toLowerCase().includes(q) ||
    row.name.toLowerCase().includes(q) ||
    (row.sector ?? '').toLowerCase().includes(q) ||
    (row.industry ?? '').toLowerCase().includes(q) ||
    row.groups.some((g) => g.toLowerCase().includes(q)) ||
    row.tags.some((t) => t.toLowerCase().includes(q))
  )
}

export interface FilterState {
  quickFilters: string[]
  query: string
  favouritesOnly: boolean
}

export function applyFilters(rows: SecurityRow[], state: FilterState): SecurityRow[] {
  const expressions = state.query.trim() ? parseExpressions(state.query) : null
  const active = state.quickFilters
    .filter((id) => id !== 'all')
    .map((id) => QUICK_FILTER_BY_ID.get(id))
    .filter((f): f is QuickFilter => Boolean(f))

  return rows.filter((row) => {
    if (state.favouritesOnly && !row.is_favourite) return false
    if (active.length && !active.every((f) => f.predicate(row))) return false
    if (state.query.trim()) {
      if (expressions) {
        if (!matchesExpressions(row, expressions)) return false
      } else if (!matchesText(row, state.query)) {
        return false
      }
    }
    return true
  })
}

/** Preset scanners used by the TECHNICALS view. */
export interface Scanner {
  id: string
  label: string
  description: string
  predicate: (row: SecurityRow) => boolean
  sort?: (a: SecurityRow, b: SecurityRow) => number
}

const desc = (get: (r: SecurityRow) => number | null | undefined) => (a: SecurityRow, b: SecurityRow) =>
  (get(b) ?? -Infinity) - (get(a) ?? -Infinity)
const asc = (get: (r: SecurityRow) => number | null | undefined) => (a: SecurityRow, b: SecurityRow) =>
  (get(a) ?? Infinity) - (get(b) ?? Infinity)

export const SCANNERS: Scanner[] = [
  {
    id: 'none',
    label: 'ALL NAMES',
    description: 'Every security currently in the monitor.',
    predicate: () => true,
  },
  {
    id: 'oversold',
    label: 'OVERSOLD',
    description: 'RSI(14) at or below 30.',
    predicate: (r) => has(r.rsi14) && r.rsi14 <= 30,
    sort: asc((r) => r.rsi14),
  },
  {
    id: 'overbought',
    label: 'OVERBOUGHT',
    description: 'RSI(14) at or above 70.',
    predicate: (r) => has(r.rsi14) && r.rsi14 >= 70,
    sort: desc((r) => r.rsi14),
  },
  {
    id: 'macd-cross-up',
    label: 'POSITIVE MACD CROSS',
    description: 'MACD line crossed above its signal on the latest session.',
    predicate: (r) => r.macd_cross_up === true,
    sort: desc((r) => r.macd_histogram),
  },
  {
    id: 'macd-cross-down',
    label: 'NEGATIVE MACD CROSS',
    description: 'MACD line crossed below its signal on the latest session.',
    predicate: (r) => r.macd_cross_down === true,
    sort: asc((r) => r.macd_histogram),
  },
  {
    id: 'above-200',
    label: 'ABOVE SMA200',
    description: 'Trading above the 200-day simple moving average.',
    predicate: (r) => r.above_sma200 === true,
    sort: desc((r) => r.sma200_distance_pct),
  },
  {
    id: 'below-200',
    label: 'BELOW SMA200',
    description: 'Trading below the 200-day simple moving average.',
    predicate: (r) => r.above_sma200 === false,
    sort: asc((r) => r.sma200_distance_pct),
  },
  {
    id: 'momentum',
    label: 'HIGH MOMENTUM',
    description: '1-month return of +10% or better, price above the SMA50.',
    predicate: (r) => has(r.return_1m) && r.return_1m >= 10 && r.above_sma50 === true,
    sort: desc((r) => r.return_1m),
  },
  {
    id: 'rvol',
    label: 'HIGH RELATIVE VOLUME',
    description: 'Volume at least 1.5x the 20-day average.',
    predicate: (r) => has(r.relative_volume) && r.relative_volume >= 1.5,
    sort: desc((r) => r.relative_volume),
  },
]
