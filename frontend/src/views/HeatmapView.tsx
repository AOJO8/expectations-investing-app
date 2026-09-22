import { useMemo, useState } from 'react'
import type { SecurityRow } from '../api/types'
import { formatCompact, formatPct, formatPrice } from '../lib/format'
import { heatmapColor } from '../lib/heat'

const FILTERS: { id: string; label: string; predicate: (row: SecurityRow) => boolean }[] = [
  { id: 'all', label: 'ALL', predicate: () => true },
  { id: 'us', label: 'US', predicate: (r) => r.region === 'US' },
  { id: 'uk', label: 'UK', predicate: (r) => r.region === 'UK' },
  { id: 'europe', label: 'EUROPE', predicate: (r) => r.region === 'EUROPE' },
  { id: 'ai', label: 'AI', predicate: (r) => r.tags?.includes('AI') },
  { id: 'quantum', label: 'QUANTUM', predicate: (r) => r.groups.includes('QUANTUM COMPUTING') },
  { id: 'defence', label: 'DEFENCE', predicate: (r) => r.groups.includes('DEFENCE') },
  { id: 'energy', label: 'ENERGY', predicate: (r) => r.groups.includes('ENERGY & NUCLEAR') },
  { id: 'crypto', label: 'CRYPTO', predicate: (r) => r.tags?.includes('CRYPTO') || r.asset_class === 'CRYPTO' },
]

export function HeatmapView({
  rows,
  onSelect,
}: {
  rows: SecurityRow[]
  onSelect: (ticker: string) => void
}) {
  const [filter, setFilter] = useState('all')
  const [sizeByCap, setSizeByCap] = useState(true)

  const tiles = useMemo(() => {
    const predicate = FILTERS.find((f) => f.id === filter)?.predicate ?? (() => true)
    return rows
      .filter((row) => predicate(row) && typeof row.change_pct === 'number')
      .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
  }, [rows, filter])

  const maxCap = Math.max(...tiles.map((t) => t.market_cap ?? 0), 1)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-panel px-2 py-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            onClick={() => setFilter(option.id)}
            className="border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: filter === option.id ? 'var(--orange)' : 'var(--border)',
              background: filter === option.id ? 'rgba(255,159,28,0.14)' : 'transparent',
              color: filter === option.id ? 'var(--orange)' : 'var(--muted)',
            }}
          >
            {option.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[10px] text-muted">
          <input
            type="checkbox"
            checked={sizeByCap}
            onChange={(event) => setSizeByCap(event.target.checked)}
            className="h-[11px] w-[11px] accent-[#ff9f1c]"
          />
          Size tiles by market cap
        </label>
        <span className="num text-[10px] text-muted">{tiles.length} securities</span>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        <div className="flex flex-wrap gap-[3px]">
          {tiles.map((tile) => {
            const capRatio = sizeByCap ? Math.sqrt((tile.market_cap ?? 0) / maxCap) : 0.42
            const size = Math.max(74, Math.min(200, 74 + capRatio * 130))
            return (
              <button
                key={tile.ticker}
                onClick={() => onSelect(tile.ticker)}
                className="flex flex-col justify-between border border-border/60 p-1.5 text-left transition-transform hover:z-10 hover:scale-[1.03] hover:border-orange"
                style={{
                  width: size,
                  height: Math.max(52, size * 0.58),
                  background: heatmapColor(tile.change_pct),
                }}
                title={`${tile.name} · ${formatPrice(tile.last, tile.asset_class)} · cap ${formatCompact(tile.market_cap)}`}
              >
                <span className="num truncate text-[11px] font-semibold text-white/95">{tile.ticker}</span>
                <span className="num text-[13px] font-bold text-white">{formatPct(tile.change_pct)}</span>
                {size > 110 && (
                  <span className="num truncate text-[9px] text-white/70">
                    {formatCompact(tile.market_cap)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {!tiles.length && (
          <div className="py-16 text-center">
            <div className="label mb-1">NO PRICED SECURITIES</div>
            <div className="text-[11px] text-muted">
              Nothing in this selection has a price yet. Rows without data are excluded rather than
              drawn as flat tiles.
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-panel px-2 py-1">
        <span className="label">DAILY %</span>
        {[-5, -3, -1, 0, 1, 3, 5].map((value) => (
          <span
            key={value}
            className="num px-2 py-[1px] text-[9px] text-white/90"
            style={{ background: heatmapColor(value) }}
          >
            {value > 0 ? '+' : ''}
            {value}%
          </span>
        ))}
        <span className="ml-auto text-[9px] text-muted">
          Tile area reflects market capitalisation where Yahoo reports one.
        </span>
      </div>
    </div>
  )
}
