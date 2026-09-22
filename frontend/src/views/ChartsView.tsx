import { useState } from 'react'
import type { SecurityRow } from '../api/types'
import { useHistory } from '../hooks/useMarket'
import { MacdPane, RsiPane, VolumePane } from '../components/IndicatorPanes'
import { OVERLAY_META, PriceChart, type ChartKind, type OverlayId } from '../components/PriceChart'
import { DASH, formatPct, formatPrice } from '../lib/format'
import { directionColor, signalColor, trendColor } from '../lib/heat'

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

/** Full-width charting workspace with a security picker rail. */
export function ChartsView({
  rows,
  selectedTicker,
  onSelect,
}: {
  rows: SecurityRow[]
  selectedTicker: string | null
  onSelect: (ticker: string) => void
}) {
  const [period, setPeriod] = useState('1y')
  const [kind, setKind] = useState<ChartKind>('candlestick')
  const [overlays, setOverlays] = useState<OverlayId[]>(['sma50', 'sma200'])
  const [filter, setFilter] = useState('')

  const ticker = selectedTicker ?? rows.find((r) => r.last !== null)?.ticker ?? null
  const row = rows.find((r) => r.ticker === ticker) ?? null
  const interval = PERIODS.find((p) => p.id === period)?.interval ?? '1d'
  const { data: history, isLoading } = useHistory(ticker, period, interval)

  const listed = rows.filter(
    (r) =>
      !filter.trim() ||
      r.ticker.toLowerCase().includes(filter.toLowerCase()) ||
      r.name.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-[210px] shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border p-1.5">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter securities"
            className="h-[22px] w-full px-2 text-[11px]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {listed.map((item) => (
            <button
              key={item.ticker}
              onClick={() => onSelect(item.ticker)}
              className="flex w-full items-center justify-between gap-2 border-b border-border/30 px-2 py-[3px] text-left hover:bg-panel-secondary"
              style={{ background: item.ticker === ticker ? 'var(--panel-secondary)' : undefined }}
            >
              <span className="min-w-0">
                <span className="num block truncate text-[11px] text-orange">{item.ticker}</span>
                <span className="block truncate text-[9px] text-muted">{item.name}</span>
              </span>
              <span className="num shrink-0 text-[10px]" style={{ color: directionColor(item.change_pct) }}>
                {formatPct(item.change_pct)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {!row ? (
          <div className="flex flex-1 items-center justify-center text-[11px] text-muted">
            Select a security to chart.
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-panel px-3 py-1.5">
              <span className="text-[13px] font-semibold">{row.name}</span>
              <span className="num text-[11px] text-orange">{row.ticker}</span>
              <span className="num text-[15px]">{formatPrice(row.last, row.asset_class)}</span>
              <span className="num text-[12px]" style={{ color: directionColor(row.change_pct) }}>
                {formatPct(row.change_pct)}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: trendColor(row.trend) }}>
                {row.trend ?? DASH}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: signalColor(row.technical_signal) }}>
                {row.technical_signal ?? DASH}
              </span>

              <div className="ml-auto flex items-center gap-1">
                {PERIODS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setPeriod(option.id)}
                    className="border px-1.5 py-[2px] text-[9px] font-semibold"
                    style={{
                      borderColor: period === option.id ? 'var(--orange)' : 'var(--border)',
                      color: period === option.id ? 'var(--orange)' : 'var(--muted)',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setKind(kind === 'line' ? 'candlestick' : 'line')}
                  className="ml-1 border border-border px-1.5 py-[2px] text-[9px] font-semibold uppercase text-muted hover:border-orange hover:text-orange"
                >
                  {kind}
                </button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-3 py-1">
              <span className="label mr-1">OVERLAYS</span>
              {(Object.keys(OVERLAY_META) as OverlayId[]).map((id) => {
                const meta = OVERLAY_META[id]
                const active = overlays.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => setOverlays((prev) => (active ? prev.filter((o) => o !== id) : [...prev, id]))}
                    className="flex items-center gap-1 border px-1.5 py-[2px] text-[9px] font-semibold"
                    style={{ borderColor: active ? meta.color : 'var(--border)', color: active ? meta.color : 'var(--muted)' }}
                  >
                    <span className="inline-block h-[2px] w-[8px]" style={{ background: active ? meta.color : 'var(--muted)' }} />
                    {meta.label}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="skeleton m-3 h-[420px]" />
              ) : (history?.candles.length ?? 0) < 2 ? (
                <div className="py-24 text-center">
                  <div className="label mb-1">NO PRICE HISTORY</div>
                  <div className="text-[11px] text-muted">
                    {history?.message ?? 'The provider returned no candles for this security.'}
                  </div>
                </div>
              ) : (
                <>
                  <PriceChart candles={history!.candles} kind={kind} overlays={overlays} height={420} />
                  <VolumePane candles={history!.candles} height={80} />
                  <RsiPane candles={history!.candles} height={92} />
                  <MacdPane candles={history!.candles} height={92} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
