import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import type { SecurityRow } from '../api/types'
import { DASH, formatCompact, formatCurrencyPrice, formatPct } from '../lib/format'
import { directionColor } from '../lib/heat'
import {
  AtrCell,
  ChangeCell,
  ChangePctCell,
  MacdHistogramCell,
  MaStructureCell,
  NumericCell,
  Pending,
  PriceCell,
  RelativeVolumeCell,
  ReturnCell,
  RsiCell,
  SecurityCell,
  SignalCell,
  SparklineCell,
  StatusCell,
  TickerCell,
  TrendCell,
  UpdatedCell,
  VolatilityCell,
  VolumeCell,
} from './cells'

const helper = createColumnHelper<SecurityRow>()

export interface ColumnContext {
  onToggleFavourite: (ticker: string) => void
  ticks: Map<string, 'up' | 'down'>
  flashPrices: boolean
  showSparkline: boolean
}

/** Numeric accessor that keeps nulls sorting last regardless of direction. */
const num = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function buildColumns(ctx: ColumnContext): ColumnDef<SecurityRow, any>[] {
  const columns: ColumnDef<SecurityRow, any>[] = [
    helper.accessor('name', {
      id: 'name',
      header: 'Security',
      size: 190,
      minSize: 120,
      enableHiding: false,
      cell: ({ row }) => <SecurityCell row={row.original} onToggleFavourite={ctx.onToggleFavourite} />,
    }),
    helper.accessor('ticker', {
      id: 'ticker',
      header: 'Ticker',
      size: 86,
      minSize: 60,
      enableHiding: false,
      cell: ({ row }) => <TickerCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.last), {
      id: 'last',
      header: 'Last',
      size: 96,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <PriceCell row={row.original} tick={ctx.ticks.get(row.original.ticker)} flash={ctx.flashPrices} />
      ),
    }),
    helper.accessor((r) => num(r.change), {
      id: 'change',
      header: 'Change',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => <ChangeCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.change_pct), {
      id: 'change_pct',
      header: 'Change %',
      size: 96,
      meta: { align: 'right' },
      cell: ({ row }) => <ChangePctCell row={row.original} />,
    }),
  ]

  if (ctx.showSparkline) {
    columns.push(
      helper.accessor((r) => num(r.sparkline_change_pct), {
        id: 'sparkline',
        header: '30D',
        size: 80,
        enableSorting: true,
        meta: { align: 'center' },
        cell: ({ row }) => <SparklineCell row={row.original} />,
      }),
    )
  }

  columns.push(
    helper.accessor((r) => num(r.open), {
      id: 'open',
      header: 'Open',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="num w-full text-right text-[11px]">
          {formatCurrencyPrice(row.original.open, null, row.original.asset_class)}
        </span>
      ),
    }),
    helper.accessor((r) => num(r.day_high), {
      id: 'day_high',
      header: 'Day High',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.day_high} />,
    }),
    helper.accessor((r) => num(r.day_low), {
      id: 'day_low',
      header: 'Day Low',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.day_low} />,
    }),
    helper.accessor((r) => num(r.previous_close), {
      id: 'previous_close',
      header: 'Prev Close',
      size: 88,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.previous_close} />,
    }),
    helper.accessor((r) => num(r.volume), {
      id: 'volume',
      header: 'Volume',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => <VolumeCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.relative_volume), {
      id: 'relative_volume',
      header: 'Rel Vol',
      size: 76,
      meta: { align: 'right' },
      cell: ({ row }) => <RelativeVolumeCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.market_cap), {
      id: 'market_cap',
      header: 'Mkt Cap',
      size: 88,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="num w-full text-right text-[11px]">{formatCompact(row.original.market_cap)}</span>
      ),
    }),
    helper.accessor((r) => r.currency ?? '', {
      id: 'currency',
      header: 'CCY',
      size: 58,
      cell: ({ row }) => (
        <span className="num text-[10px] text-muted">{row.original.currency ?? DASH}</span>
      ),
    }),
    helper.accessor((r) => num(r.high_52w), {
      id: 'high_52w',
      header: '52W High',
      size: 88,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.high_52w} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.low_52w), {
      id: 'low_52w',
      header: '52W Low',
      size: 88,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.low_52w} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.from_52w_high_pct), {
      id: 'from_52w_high_pct',
      header: 'From 52W H',
      size: 106,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="num w-full text-right text-[11px]" style={{ color: 'var(--muted)' }}>
          <Pending loaded={row.original.technicals_loaded} row={row.original}>
            {formatPct(row.original.from_52w_high_pct)}
          </Pending>
        </span>
      ),
    }),
    helper.accessor((r) => num(r.return_1w), {
      id: 'return_1w',
      header: '1W %',
      size: 76,
      meta: { align: 'right' },
      cell: ({ row }) => <ReturnCell value={row.original.return_1w} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.return_1m), {
      id: 'return_1m',
      header: '1M %',
      size: 76,
      meta: { align: 'right' },
      cell: ({ row }) => <ReturnCell value={row.original.return_1m} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.return_3m), {
      id: 'return_3m',
      header: '3M %',
      size: 76,
      meta: { align: 'right' },
      cell: ({ row }) => <ReturnCell value={row.original.return_3m} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.return_ytd), {
      id: 'return_ytd',
      header: 'YTD %',
      size: 78,
      meta: { align: 'right' },
      cell: ({ row }) => <ReturnCell value={row.original.return_ytd} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.return_1y), {
      id: 'return_1y',
      header: '1Y %',
      size: 78,
      meta: { align: 'right' },
      cell: ({ row }) => <ReturnCell value={row.original.return_1y} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.rsi14), {
      id: 'rsi14',
      header: 'RSI 14',
      size: 70,
      meta: { align: 'right' },
      cell: ({ row }) => <RsiCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.macd), {
      id: 'macd',
      header: 'MACD',
      size: 78,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <NumericCell value={row.original.macd} decimals={3} loaded={row.original.technicals_loaded} row={row.original} />
      ),
    }),
    helper.accessor((r) => num(r.macd_signal), {
      id: 'macd_signal',
      header: 'Signal',
      size: 78,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <NumericCell value={row.original.macd_signal} decimals={3} loaded={row.original.technicals_loaded} row={row.original} />
      ),
    }),
    helper.accessor((r) => num(r.macd_histogram), {
      id: 'macd_histogram',
      header: 'MACD Hist',
      size: 96,
      meta: { align: 'right' },
      cell: ({ row }) => <MacdHistogramCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.sma20), {
      id: 'sma20',
      header: 'SMA 20',
      size: 82,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.sma20} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.sma50), {
      id: 'sma50',
      header: 'SMA 50',
      size: 82,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.sma50} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.sma200), {
      id: 'sma200',
      header: 'SMA 200',
      size: 82,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.sma200} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.ema20), {
      id: 'ema20',
      header: 'EMA 20',
      size: 82,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.ema20} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.ema50), {
      id: 'ema50',
      header: 'EMA 50',
      size: 82,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.ema50} loaded={row.original.technicals_loaded} row={row.original} />,
    }),
    helper.accessor((r) => num(r.sma50_distance_pct), {
      id: 'sma50_distance_pct',
      header: 'vs SMA50',
      size: 84,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span
          className="num w-full text-right text-[11px]"
          style={{ color: directionColor(row.original.sma50_distance_pct) }}
        >
          <Pending loaded={row.original.technicals_loaded} row={row.original}>
            {formatPct(row.original.sma50_distance_pct)}
          </Pending>
        </span>
      ),
    }),
    helper.accessor((r) => num(r.sma200_distance_pct), {
      id: 'sma200_distance_pct',
      header: 'vs SMA200',
      size: 88,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span
          className="num w-full text-right text-[11px]"
          style={{ color: directionColor(row.original.sma200_distance_pct) }}
        >
          <Pending loaded={row.original.technicals_loaded} row={row.original}>
            {formatPct(row.original.sma200_distance_pct)}
          </Pending>
        </span>
      ),
    }),
    helper.accessor((r) => num(r.atr14), {
      id: 'atr14',
      header: 'ATR 14',
      size: 76,
      meta: { align: 'right' },
      cell: ({ row }) => <AtrCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.volatility_20d), {
      id: 'volatility_20d',
      header: '20D Vol',
      size: 78,
      meta: { align: 'right' },
      cell: ({ row }) => <VolatilityCell row={row.original} />,
    }),
    helper.accessor((r) => num(r.beta), {
      id: 'beta',
      header: 'Beta',
      size: 66,
      meta: { align: 'right' },
      cell: ({ row }) => <NumericCell value={row.original.beta} />,
    }),
    helper.accessor((r) => r.ma_structure ?? '', {
      id: 'ma_structure',
      header: 'MA Structure',
      size: 118,
      cell: ({ row }) => <MaStructureCell row={row.original} />,
    }),
    helper.accessor((r) => r.trend ?? '', {
      id: 'trend',
      header: 'Trend',
      size: 128,
      cell: ({ row }) => <TrendCell row={row.original} />,
    }),
    helper.accessor((r) => r.technical_signal ?? '', {
      id: 'technical_signal',
      header: 'Technical Signal',
      size: 118,
      cell: ({ row }) => <SignalCell row={row.original} />,
    }),
    helper.accessor((r) => r.sector ?? '', {
      id: 'sector',
      header: 'Sector',
      size: 130,
      cell: ({ row }) => (
        <span className="truncate text-[11px] text-muted">{row.original.sector ?? DASH}</span>
      ),
    }),
    helper.accessor((r) => r.status, {
      id: 'status',
      header: 'Status',
      size: 84,
      cell: ({ row }) => <StatusCell row={row.original} />,
    }),
    helper.accessor((r) => r.updated_at, {
      id: 'updated_at',
      header: 'Updated',
      size: 80,
      meta: { align: 'right' },
      cell: ({ row }) => <UpdatedCell row={row.original} />,
    }),
  )

  return columns
}

/** Columns hidden by default so the first view is not overwhelming. */
export const DEFAULT_HIDDEN_COLUMNS: Record<string, boolean> = {
  open: false,
  day_high: false,
  day_low: false,
  previous_close: false,
  currency: false,
  low_52w: false,
  macd: false,
  macd_signal: false,
  ema20: false,
  ema50: false,
  sma20: false,
  sma50_distance_pct: false,
  sma200_distance_pct: false,
  sector: false,
  beta: false,
  return_1y: false,
}

export const COLUMN_LABELS: Record<string, string> = {
  name: 'Security',
  ticker: 'Ticker',
  last: 'Last',
  change: 'Change',
  change_pct: 'Change %',
  sparkline: '30D Sparkline',
  open: 'Open',
  day_high: 'Day High',
  day_low: 'Day Low',
  previous_close: 'Previous Close',
  volume: 'Volume',
  relative_volume: 'Relative Volume',
  market_cap: 'Market Cap',
  currency: 'Currency',
  high_52w: '52W High',
  low_52w: '52W Low',
  from_52w_high_pct: 'From 52W High',
  return_1w: '1W %',
  return_1m: '1M %',
  return_3m: '3M %',
  return_ytd: 'YTD %',
  return_1y: '1Y %',
  rsi14: 'RSI 14',
  macd: 'MACD',
  macd_signal: 'MACD Signal',
  macd_histogram: 'MACD Histogram',
  sma20: 'SMA 20',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  ema20: 'EMA 20',
  ema50: 'EMA 50',
  sma50_distance_pct: 'SMA50 Distance',
  sma200_distance_pct: 'SMA200 Distance',
  atr14: 'ATR 14',
  volatility_20d: '20D Volatility',
  beta: 'Beta',
  ma_structure: 'MA Structure',
  trend: 'Trend',
  technical_signal: 'Technical Signal',
  sector: 'Sector',
  status: 'Status',
  updated_at: 'Updated',
}
