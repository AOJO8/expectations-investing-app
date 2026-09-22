import type { Breadth, SecurityRow } from '../api/types'
import { formatPct, formatPrice, formatVolume } from '../lib/format'
import { directionColor } from '../lib/heat'
import { Tooltip, TooltipTitle } from './Tooltip'

/** Breadth + top movers, computed only from the securities in this monitor. */
export function BreadthPanel({
  breadth,
  rows,
  onSelect,
}: {
  breadth: Breadth | undefined
  rows: SecurityRow[]
  onSelect: (ticker: string) => void
}) {
  if (!breadth) return null

  const priced = rows.filter((r) => typeof r.change_pct === 'number')
  const gainers = [...priced].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0)).slice(0, 5)
  const losers = [...priced].sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0)).slice(0, 5)
  const active = [...rows]
    .filter((r) => typeof r.relative_volume === 'number')
    .sort((a, b) => (b.relative_volume ?? 0) - (a.relative_volume ?? 0))
    .slice(0, 5)

  return (
    <aside className="flex w-[228px] shrink-0 flex-col gap-px overflow-y-auto border-l border-border bg-bg">
      <section className="bg-panel p-2">
        <Tooltip
          block
          content={
            <>
              <TooltipTitle>BREADTH</TooltipTitle>
              <div className="text-muted">
                Advancing, declining and unchanged counts across the {breadth.total} securities in
                this monitor — not the whole market. Rows with no price are excluded
                ({breadth.total - breadth.priced} excluded).
              </div>
            </>
          }
        >
          <div className="label mb-1.5 w-full">BREADTH</div>
        </Tooltip>

        <div className="mb-2 flex items-baseline gap-3">
          <span className="num text-[13px]" style={{ color: 'var(--positive)' }}>
            ▲ {breadth.advancing}
          </span>
          <span className="num text-[13px]" style={{ color: 'var(--negative)' }}>
            ▼ {breadth.declining}
          </span>
          <span className="num text-[13px] text-neutral">— {breadth.unchanged}</span>
        </div>

        <div className="mb-1 h-[3px] w-full overflow-hidden bg-[#1b222a]">
          <div className="flex h-full">
            <div
              style={{
                width: `${breadth.priced ? (breadth.advancing / breadth.priced) * 100 : 0}%`,
                background: 'var(--positive)',
              }}
            />
            <div
              style={{
                width: `${breadth.priced ? (breadth.declining / breadth.priced) * 100 : 0}%`,
                background: 'var(--negative)',
              }}
            />
          </div>
        </div>

        <MetricBar
          label="SMA50"
          value={breadth.pct_above_sma50}
          sample={breadth.sample_sma50}
          tip="Share of securities trading above their 50-day simple moving average."
        />
        <MetricBar
          label="SMA200"
          value={breadth.pct_above_sma200}
          sample={breadth.sample_sma200}
          tip="Share of securities trading above their 200-day simple moving average."
        />
      </section>

      <MoverList title="TOP GAINERS" rows={gainers} onSelect={onSelect} />
      <MoverList title="TOP LOSERS" rows={losers} onSelect={onSelect} />
      <MoverList title="MOST ACTIVE" rows={active} onSelect={onSelect} mode="volume" />
    </aside>
  )
}

function MetricBar({
  label,
  value,
  sample,
  tip,
}: {
  label: string
  value: number | null
  sample: number
  tip: string
}) {
  return (
    <Tooltip
      block
      content={
        <>
          <TooltipTitle>% ABOVE {label}</TooltipTitle>
          <div className="text-muted">{tip}</div>
          <div className="mt-1 text-[10px]">Sample: {sample} securities with enough history.</div>
        </>
      }
    >
      <div className="mt-1 flex w-full items-center gap-2">
        <span className="w-[42px] text-[10px] uppercase tracking-wider text-muted">{label}</span>
        <div className="h-[3px] flex-1 bg-[#1b222a]">
          <div
            className="h-full"
            style={{
              width: `${value ?? 0}%`,
              background: (value ?? 0) >= 50 ? 'var(--positive)' : 'var(--negative)',
            }}
          />
        </div>
        <span className="num w-[34px] text-right text-[10px]">
          {value === null ? '—' : `${value.toFixed(0)}%`}
        </span>
      </div>
    </Tooltip>
  )
}

function MoverList({
  title,
  rows,
  onSelect,
  mode = 'change',
}: {
  title: string
  rows: SecurityRow[]
  onSelect: (ticker: string) => void
  mode?: 'change' | 'volume'
}) {
  return (
    <section className="bg-panel p-2">
      <div className="label mb-1">{title}</div>
      {rows.length === 0 && <div className="text-[10px] text-muted">No data yet</div>}
      {rows.map((row) => (
        <button
          key={row.ticker}
          onClick={() => onSelect(row.ticker)}
          className="flex w-full items-center justify-between gap-2 py-[2px] hover:bg-panel-secondary"
        >
          <span className="num truncate text-[11px] text-text">{row.ticker}</span>
          {mode === 'change' ? (
            <span className="num text-[11px]" style={{ color: directionColor(row.change_pct) }}>
              {formatPct(row.change_pct)}
            </span>
          ) : (
            <span className="flex items-baseline gap-1.5">
              <span className="num text-[10px] text-muted">{formatVolume(row.volume)}</span>
              <span className="num text-[11px] text-orange">
                {row.relative_volume ? `${row.relative_volume.toFixed(1)}x` : '—'}
              </span>
            </span>
          )}
        </button>
      ))}
      {mode === 'change' && rows[0] && (
        <div className="mt-1 border-t border-border pt-1 text-[9px] text-muted">
          Last {formatPrice(rows[0].last, rows[0].asset_class)} · {rows[0].name}
        </div>
      )}
    </section>
  )
}
