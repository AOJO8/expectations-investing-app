import { Loader2, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SecurityRow } from '../api/types'
import { useSearch, useWatchlistActions, useWatchlists } from '../hooks/useMarket'
import { formatPct, formatPrice } from '../lib/format'
import { directionColor } from '../lib/heat'

interface SearchPaletteProps {
  open: boolean
  onClose: () => void
  rows: SecurityRow[]
  groups: string[]
  onSelect: (ticker: string) => void
}

/** Global security search: jump to a row, or add a new symbol to the monitor. */
export function SearchPalette({ open, onClose, rows, groups, onSelect }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('WATCHLIST')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: watchlists } = useWatchlists()
  const defaultList = watchlists?.watchlists.find((w) => w.is_default)
  const { add } = useWatchlistActions(defaultList?.id)
  const { data, isFetching } = useSearch(query)

  const rowsByTicker = useMemo(() => new Map(rows.map((r) => [r.ticker, r])), [rows])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      window.setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const results = data?.results ?? []

  if (!open) return null

  const handleAdd = async (ticker: string) => {
    if (!defaultList) return
    await add.mutateAsync({ ticker, group })
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[highlight]
      if (!result) return
      if (result.in_universe || rowsByTicker.has(result.ticker)) {
        onSelect(result.ticker)
        onClose()
      } else {
        void handleAdd(result.ticker)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-black/60 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] border border-border bg-panel shadow-[0_18px_50px_rgba(0,0,0,0.8)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={13} className="text-orange" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlight(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search ticker or company — AAPL, Apple, NVDA, Tesla"
            className="flex-1 border-0 bg-transparent text-[13px] outline-none"
          />
          {isFetching && <Loader2 size={12} className="animate-spin text-muted" />}
          <kbd className="border border-border px-1 text-[9px] text-muted">ESC</kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto">
          {!query && (
            <div className="px-3 py-6 text-center text-[11px] text-muted">
              Type to search the monitor universe, or enter any Yahoo Finance symbol to add it.
            </div>
          )}
          {query && !results.length && !isFetching && (
            <div className="px-3 py-6 text-center text-[11px] text-muted">No matches.</div>
          )}
          {results.map((result, index) => {
            const row = rowsByTicker.get(result.ticker)
            const known = result.in_universe || Boolean(row)
            return (
              <button
                key={`${result.source}-${result.ticker}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => (known ? (onSelect(result.ticker), onClose()) : handleAdd(result.ticker))}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left"
                style={{ background: index === highlight ? 'var(--panel-secondary)' : 'transparent' }}
              >
                <span className="num w-[84px] shrink-0 text-[12px] font-medium text-orange">
                  {result.ticker}
                </span>
                <span className="flex-1 truncate text-[11px]">{result.name}</span>
                {row && typeof row.last === 'number' ? (
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="num text-[11px]">{formatPrice(row.last, row.asset_class)}</span>
                    <span className="num text-[10px]" style={{ color: directionColor(row.change_pct) }}>
                      {formatPct(row.change_pct)}
                    </span>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[9px] uppercase text-muted">
                    {known ? 'in monitor' : (
                      <>
                        <Plus size={9} /> add
                      </>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
          <span className="label">ADD TO</span>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="h-[20px] px-1 text-[10px]"
          >
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[9px] text-muted">
            ↑↓ navigate · ⏎ open or add · symbols that never resolve are kept and marked UNAVAILABLE
          </span>
        </div>
      </div>
    </div>
  )
}
