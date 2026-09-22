import { CandlestickChart, ChevronRight, LineChart as LineIcon, Star, X } from 'lucide-react'
import { useState } from 'react'
import type { SecurityRow } from '../api/types'
import { useHistory } from '../hooks/useMarket'
import {
  DASH,
  currencyLabel,
  formatCompact,
  formatCurrencyPrice,
  formatNumber,
  formatPct,
  formatPrice,
  formatVolume,
  isNum,
} from '../lib/format'
import { directionColor, signalColor, trendColor } from '../lib/heat'
import { MacdPane, RsiPane, VolumePane } from './IndicatorPanes'
import { OVERLAY_META, PriceChart, type ChartKind, type OverlayId } from './PriceChart'
import { StatusPill } from './StatusPill'
import { Tooltip, TooltipTitle } from './Tooltip'

const PERIODS: { id: string; label: string; interval: string }[] = [
  { id: '1d', label: '1D', interval: '30m' },
  { id: '5d', label: '5D', interval: '60m' },
  { id: '1mo', label: '1M', interval: '1d' },
  { id: '3mo', label: '3M', interval: '1d' },
  { id: '6mo', label: '6M', interval: '1d' },
  { id: 'ytd', label: 'YTD', interval: '1d' },
  { id: '1y', label: '1Y', interval: '1d' },
  { id: '5y', label: '5Y', interval: '1wk' },
  { id: 'max', label: 'MAX', interval: '1mo' },
]

interface DetailDrawerProps {
  row: SecurityRow | null
  onClose: () => void
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleFavourite: (ticker: string) => void
}

export function DetailDrawer({
  row,
  onClose,
  collapsed,
  onToggleCollapse,
  onToggleFavourite,
}: DetailDrawerProps) {
  const [period, setPeriod] = useState('1y')
  const [kind, setKind] = useState<ChartKind>('line')
  const [overlays, setOverlays] = useState<OverlayId[]>(['sma50', 'sma200'])

  const interval = PERIODS.find((p) => p.id === period)?.interval ?? '1d'
  const { data: history, isLoading } = useHistory(row?.ticker ?? null, period, interval)

  if (!row) return null

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex w-[30px] shrink-0 flex-col items-center gap-2 border-l border-border bg-panel py-2 hover:bg-panel-secondary"
        title="Expand detail panel"
      >
        <ChevronRight size={13} className="rotate-180 text-orange" />
        <span
          className="num text-[10px] tracking-wider text-orange"
          style={{ writingMode: 'vertical-rl' }}
        >
          {row.ticker}
        </span>
      </button>
    )
  }

  const candles = history?.candles ?? []

  return (
    <aside className="flex w-[430px] shrink-0 flex-col overflow-hidden border-l border-border bg-panel">
      {/* ------------------------------------------------------------ header */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[14px] font-semibold">{row.name}</h2>
              <button onClick={() => onToggleFavourite(row.ticker)} className="text-muted hover:text-orange">
                <Star size={11} fill={row.is_favourite ? 'var(--orange)' : 'none'} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="num text-[11px] text-orange">{row.ticker}</span>
              {row.exchange && <span className="text-[10px] text-muted">{row.exchange}</span>}
              <StatusPill status={row.status} message={row.status_message} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onToggleCollapse} title="Collapse" className="text-muted hover:text-orange">
              <ChevronRight size={14} />
            </button>
            <button onClick={onClose} title="Close (Esc)" className="text-muted hover:text-orange">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-baseline gap-3">
          <span className="num text-[24px] font-semibold leading-none">
            {formatCurrencyPrice(row.last, row.currency, row.asset_class)}
          </span>
          <span className="num text-[13px]" style={{ color: directionColor(row.change_pct) }}>
            {isNum(row.change) ? `${row.change > 0 ? '+' : ''}${formatPrice(row.change, row.asset_class)}` : DASH}
          </span>
          <span className="num text-[13px]" style={{ color: directionColor(row.change_pct) }}>
            {formatPct(row.change_pct)}
          </span>
        </div>
        {row.note && <div className="mt-1 text-[10px] text-orange">{row.note}</div>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* --------------------------------------------------------- stats */}
        <div className="grid grid-cols-2 gap-x-3 border-b border-border px-3 py-2">
          {/* Every field here comes straight from the provider; anything it does
              not report shows an em dash rather than a substituted value. */}
          <Stat label="Open" value={formatPrice(row.open, row.asset_class)} />
          <Stat label="Previous Close" value={formatPrice(row.previous_close, row.asset_class)} />
          <Stat label="Day High" value={formatPrice(row.day_high, row.asset_class)} />
          <Stat label="Day Low" value={formatPrice(row.day_low, row.asset_class)} />
          <Stat label="Volume" value={formatVolume(row.volume)} />
          <Stat label="Avg Volume" value={formatVolume(row.average_volume ?? row.average_volume_20d)} />
          <Stat label="Market Cap" value={formatCompact(row.market_cap)} />
          <Stat label="Currency" value={currencyLabel(row.currency)} />
          <Stat
            label="52W Range"
            value={
              isNum(row.low_52w) && isNum(row.high_52w)
                ? `${formatPrice(row.low_52w, row.asset_class)} – ${formatPrice(row.high_52w, row.asset_class)}`
                : DASH
            }
            span
          />
          <Stat label="Beta" value={formatNumber(row.beta, 2)} />
          <Stat label="Rel Volume" value={isNum(row.relative_volume) ? `${row.relative_volume.toFixed(2)}x` : DASH} />
          <Stat label="Trailing P/E" value={formatNumber(row.trailing_pe, 2)} />
          <Stat label="Forward P/E" value={formatNumber(row.forward_pe, 2)} />
          <Stat label="Price / Book" value={formatNumber(row.price_to_book, 2)} />
          <Stat
            label="Dividend Yield"
            value={isNum(row.dividend_yield) ? `${(row.dividend_yield * 100).toFixed(2)}%` : DASH}
          />
          <Stat label="Sector" value={row.sector ?? DASH} span />
          <Stat label="Industry" value={row.industry ?? DASH} span />
        </div>

        {/* ------------------------------------------------- chart controls */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              onClick={() => setPeriod(option.id)}
              className="border px-1.5 py-[2px] text-[9px] font-semibold"
              style={{
                borderColor: period === option.id ? 'var(--orange)' : 'var(--border)',
                background: period === option.id ? 'rgba(255,159,28,0.14)' : 'transparent',
                color: period === option.id ? 'var(--orange)' : 'var(--muted)',
              }}
            >
              {option.label}
            </button>
          ))}
          <div className="ml-auto flex border border-border">
            <button
              onClick={() => setKind('line')}
              className="px-1.5 py-[2px]"
              style={{ background: kind === 'line' ? 'var(--orange)' : 'transparent', color: kind === 'line' ? '#0b0d10' : 'var(--muted)' }}
              title="Line"
            >
              <LineIcon size={10} />
            </button>
            <button
              onClick={() => setKind('candlestick')}
              className="px-1.5 py-[2px]"
              style={{
                background: kind === 'candlestick' ? 'var(--orange)' : 'transparent',
                color: kind === 'candlestick' ? '#0b0d10' : 'var(--muted)',
              }}
              title="Candlestick"
            >
              <CandlestickChart size={10} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
          <span className="label mr-1">OVERLAYS</span>
          {(Object.keys(OVERLAY_META) as OverlayId[]).map((id) => {
            const meta = OVERLAY_META[id]
            const active = overlays.includes(id)
            return (
              <button
                key={id}
                onClick={() =>
                  setOverlays((prev) => (active ? prev.filter((o) => o !== id) : [...prev, id]))
                }
                className="flex items-center gap-1 border px-1.5 py-[2px] text-[9px] font-semibold"
                style={{
                  borderColor: active ? meta.color : 'var(--border)',
                  color: active ? meta.color : 'var(--muted)',
                }}
              >
                <span className="inline-block h-[2px] w-[8px]" style={{ background: active ? meta.color : 'var(--muted)' }} />
                {meta.label}
              </button>
            )
          })}
        </div>

        {/* ---------------------------------------------------------- charts */}
        {isLoading ? (
          <div className="skeleton m-2 h-[230px]" />
        ) : candles.length < 2 ? (
          <div className="px-3 py-10 text-center">
            <div className="label mb-1">NO PRICE HISTORY</div>
            <div className="text-[11px] text-muted">
              {history?.message ?? 'The provider returned no candles for this period.'}
            </div>
          </div>
        ) : (
          <>
            <PriceChart candles={candles} kind={kind} overlays={overlays} />
            <VolumePane candles={candles} />
            <RsiPane candles={candles} />
            <MacdPane candles={candles} />
          </>
        )}

        {/* ------------------------------------------------------ technicals */}
        <div className="border-t border-border px-3 py-2">
          <div className="label mb-1.5">TECHNICAL SUMMARY</div>
          <div className="grid grid-cols-2 gap-x-3">
            <Stat label="Trend" value={row.trend ?? DASH} color={trendColor(row.trend)} />
            <Stat
              label="Signal"
              value={row.technical_signal ?? DASH}
              color={signalColor(row.technical_signal)}
            />
            <Stat label="RSI 14" value={formatNumber(row.rsi14, 1)} />
            <Stat label="MACD Hist" value={formatNumber(row.macd_histogram, 4)} />
            <Stat label="SMA 20" value={formatPrice(row.sma20, row.asset_class)} />
            <Stat label="SMA 50" value={formatPrice(row.sma50, row.asset_class)} />
            <Stat label="SMA 200" value={formatPrice(row.sma200, row.asset_class)} />
            <Stat label="EMA 20" value={formatPrice(row.ema20, row.asset_class)} />
            <Stat label="ATR 14" value={formatNumber(row.atr14, 2)} />
            <Stat
              label="20D Vol"
              value={isNum(row.volatility_20d) ? `${row.volatility_20d.toFixed(1)}%` : DASH}
            />
          </div>

          {row.technical_score && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="label">SCORE BREAKDOWN</span>
                <span className="num text-[11px]" style={{ color: signalColor(row.technical_signal) }}>
                  {row.technical_score.score > 0 ? '+' : ''}
                  {row.technical_score.score} / ±{row.technical_score.max_score}
                </span>
              </div>
              {row.technical_score.components.map((component) => (
                <div key={component.key} className="flex items-start justify-between gap-2 py-[1px] text-[10px]">
                  <span className="min-w-0">
                    <span className="text-text">{component.label}</span>{' '}
                    <span className="text-muted">{component.detail}</span>
                  </span>
                  <span className="num shrink-0" style={{ color: directionColor(component.points) }}>
                    {component.points > 0 ? '+' : ''}
                    {component.points}
                  </span>
                </div>
              ))}
              <div className="mt-1.5 text-[9px] leading-[13px] text-muted">
                {row.technical_score.disclaimer}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-3 py-2">
          <div className="grid grid-cols-5 gap-1">
            {[
              ['1W', row.return_1w],
              ['1M', row.return_1m],
              ['3M', row.return_3m],
              ['YTD', row.return_ytd],
              ['1Y', row.return_1y],
            ].map(([label, value]) => (
              <div key={label as string} className="border border-border px-1 py-1 text-center">
                <div className="text-[9px] uppercase text-muted">{label}</div>
                <div className="num text-[11px]" style={{ color: directionColor(value as number) }}>
                  {formatPct(value as number)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-3 py-1.5">
        <Tooltip
          content={
            <>
              <TooltipTitle>DATA SOURCE</TooltipTitle>
              <div className="text-muted">
                {row.is_synthetic_source
                  ? 'Synthetic fixture data — not market data.'
                  : 'Yahoo Finance, delayed. Fundamentals are shown only where Yahoo provides them; a missing field shows an em dash rather than a guess.'}
              </div>
            </>
          }
        >
          <span className="text-[9px] text-muted">
            {row.data_source} · {row.session_date ? new Date(row.session_date).toLocaleDateString('en-GB') : '—'}
          </span>
        </Tooltip>
      </div>
    </aside>
  )
}

function Stat({
  label,
  value,
  color,
  span,
}: {
  label: string
  value: string
  color?: string
  span?: boolean
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-border/40 py-[3px]"
      style={span ? { gridColumn: 'span 2' } : undefined}
    >
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="num truncate text-[11px]" style={{ color: color ?? 'var(--text)' }}>
        {value}
      </span>
    </div>
  )
}
