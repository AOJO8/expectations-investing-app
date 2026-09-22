import { useMemo, useState } from 'react'
import type { SecurityRow } from '../api/types'
import { SCANNERS } from '../lib/filters'
import { DASH, formatNumber, formatPct, formatPrice, isNum } from '../lib/format'
import { directionColor, rsiColor, signalColor, trendColor } from '../lib/heat'

type SortKey =
  | 'ticker'
  | 'last'
  | 'change_pct'
  | 'return_1w'
  | 'return_1m'
  | 'rsi14'
  | 'macd_histogram'
  | 'relative_volume'
  | 'sma50_distance_pct'
  | 'sma200_distance_pct'
  | 'trend'
  | 'technical_signal'

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; width: string }[] = [
  { key: 'ticker', label: 'Ticker', align: 'left', width: '90px' },
  { key: 'last', label: 'Price', align: 'right', width: '92px' },
  { key: 'change_pct', label: '1D', align: 'right', width: '78px' },
  { key: 'return_1w', label: '1W', align: 'right', width: '78px' },
  { key: 'return_1m', label: '1M', align: 'right', width: '78px' },
  { key: 'rsi14', label: 'RSI', align: 'right', width: '68px' },
  { key: 'macd_histogram', label: 'MACD Hist', align: 'right', width: '92px' },
  { key: 'relative_volume', label: 'Rel Vol', align: 'right', width: '80px' },
  { key: 'sma50_distance_pct', label: 'SMA50 Dist', align: 'right', width: '96px' },
  { key: 'sma200_distance_pct', label: 'SMA200 Dist', align: 'right', width: '104px' },
  { key: 'trend', label: 'Trend', align: 'left', width: '132px' },
  { key: 'technical_signal', label: 'Signal', align: 'left', width: '112px' },
]

export function TechnicalsView({
  rows,
  onSelect,
  selectedTicker,
  isHydrating,
}: {
  rows: SecurityRow[]
  onSelect: (ticker: string) => void
  selectedTicker: string | null
  isHydrating: boolean
}) {
  const [scanner, setScanner] = useState('none')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'change_pct', desc: true })

  const active = SCANNERS.find((s) => s.id === scanner) ?? SCANNERS[0]

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => row.last !== null && active.predicate(row))
    const comparator = (a: SecurityRow, b: SecurityRow) => {
      const av = a[sort.key as keyof SecurityRow]
      const bv = b[sort.key as keyof SecurityRow]
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av ?? '').localeCompare(String(bv ?? '')) * (sort.desc ? -1 : 1)
      }
      const an = typeof av === 'number' && Number.isFinite(av) ? av : null
      const bn = typeof bv === 'number' && Number.isFinite(bv) ? bv : null
      if (an === null && bn === null) return 0
      if (an === null) return 1 // nulls always last
      if (bn === null) return -1
      return sort.desc ? bn - an : an - bn
    }
    return [...filtered].sort(comparator)
  }, [rows, active, sort])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-panel">
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
          <span className="label mr-1">SCANNERS</span>
          {SCANNERS.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                setScanner(option.id)
                if (option.sort) {
                  const key: SortKey =
                    option.id === 'oversold' || option.id === 'overbought'
                      ? 'rsi14'
                      : option.id === 'rvol'
                        ? 'relative_volume'
                        : option.id === 'momentum'
                          ? 'return_1m'
                          : option.id.includes('200')
                            ? 'sma200_distance_pct'
                            : 'macd_histogram'
                  setSort({ key, desc: !option.id.startsWith('oversold') && !option.id.startsWith('below') })
                }
              }}
              title={option.description}
              className="border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wider"
              style={{
                borderColor: scanner === option.id ? 'var(--orange)' : 'var(--border)',
                background: scanner === option.id ? 'rgba(255,159,28,0.14)' : 'transparent',
                color: scanner === option.id ? 'var(--orange)' : 'var(--muted)',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 px-2 py-1">
          <span className="text-[10px] text-muted">{active.description}</span>
          <span className="num ml-auto text-[10px] text-muted">{visible.length} matches</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="h-[26px] border-b border-border">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className="ws-header cursor-pointer border-r border-border/60 px-2"
                  style={{ width: column.width, textAlign: column.align }}
                  onClick={() =>
                    setSort((prev) =>
                      prev.key === column.key ? { key: column.key, desc: !prev.desc } : { key: column.key, desc: true },
                    )
                  }
                >
                  {column.label}
                  {sort.key === column.key && <span className="ml-1 text-[8px]">{sort.desc ? '▼' : '▲'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={row.ticker}
                onClick={() => onSelect(row.ticker)}
                className="ws-row h-[22px] cursor-pointer border-b border-border/30"
                data-selected={row.ticker === selectedTicker}
                style={{ background: index % 2 ? 'rgba(255,255,255,0.012)' : undefined }}
              >
                <td className="num px-2 text-[11px] font-medium text-orange">{row.ticker}</td>
                <td className="num px-2 text-right text-[11px]">{formatPrice(row.last, row.asset_class)}</td>
                <Pct value={row.change_pct} />
                <Pct value={row.return_1w} />
                <Pct value={row.return_1m} />
                <td
                  className="num px-2 text-right text-[11px]"
                  style={{ color: rsiColor(row.rsi14), fontWeight: isNum(row.rsi14) && (row.rsi14 >= 70 || row.rsi14 <= 30) ? 600 : 400 }}
                >
                  {isNum(row.rsi14) ? row.rsi14.toFixed(1) : DASH}
                </td>
                <td className="num px-2 text-right text-[11px]" style={{ color: directionColor(row.macd_histogram) }}>
                  {formatNumber(row.macd_histogram, 3)}
                </td>
                <td
                  className="num px-2 text-right text-[11px]"
                  style={{
                    color: isNum(row.relative_volume) && row.relative_volume >= 1.5 ? 'var(--orange-bright)' : 'var(--text)',
                  }}
                >
                  {isNum(row.relative_volume) ? `${row.relative_volume.toFixed(2)}x` : DASH}
                </td>
                <Pct value={row.sma50_distance_pct} />
                <Pct value={row.sma200_distance_pct} />
                <td className="px-2 text-[10px] font-semibold" style={{ color: trendColor(row.trend) }}>
                  {row.trend ?? DASH}
                </td>
                <td className="px-2 text-[10px] font-semibold" style={{ color: signalColor(row.technical_signal) }}>
                  {row.technical_signal ?? DASH}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visible.length && (
          <div className="py-16 text-center">
            <div className="label mb-1">NO MATCHES</div>
            <div className="text-[11px] text-muted">
              {isHydrating
                ? 'Technical metrics are still loading for this universe.'
                : 'No security in this monitor currently meets the scanner criteria.'}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-panel px-2 py-1 text-[9px] text-muted">
        Scanner output is a rules-based screen of past prices across this monitor only. It is not
        investment advice and does not predict returns.
      </div>
    </div>
  )
}

function Pct({ value }: { value: number | null | undefined }) {
  return (
    <td className="num px-2 text-right text-[11px]" style={{ color: directionColor(value) }}>
      {formatPct(value)}
    </td>
  )
}
