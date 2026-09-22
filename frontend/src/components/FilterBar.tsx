import { Filter, Layers, X } from 'lucide-react'
import { EXPRESSION_FIELDS, QUICK_FILTERS, parseExpressions } from '../lib/filters'
import { Tooltip, TooltipTitle } from './Tooltip'

interface FilterBarProps {
  active: string[]
  onToggle: (id: string) => void
  query: string
  onQueryChange: (value: string) => void
  grouped: boolean
  onToggleGrouped: () => void
  matched: number
  total: number
  onClear: () => void
}

export function FilterBar({
  active,
  onToggle,
  query,
  onQueryChange,
  grouped,
  onToggleGrouped,
  matched,
  total,
  onClear,
}: FilterBarProps) {
  const expressions = query.trim() ? parseExpressions(query) : null
  const isExpression = Boolean(expressions)

  return (
    <div className="flex shrink-0 flex-col border-b border-border bg-panel">
      <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5">
        <Filter size={11} className="shrink-0 text-orange" />
        {QUICK_FILTERS.map((filter) => {
          const isActive =
            active.includes(filter.id) || (filter.id === 'all' && active.length === 0)
          const chip = (
            <button
              key={filter.id}
              onClick={() => onToggle(filter.id)}
              className="shrink-0 border px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wider"
              style={{
                borderColor: isActive ? 'var(--orange)' : 'var(--border)',
                background: isActive ? 'rgba(255,159,28,0.14)' : 'transparent',
                color: isActive ? 'var(--orange)' : 'var(--muted)',
              }}
            >
              {filter.label}
            </button>
          )
          return filter.hint ? (
            <Tooltip
              key={filter.id}
              anchorClassName="shrink-0"
              content={<div className="text-muted">{filter.hint}</div>}
            >
              {chip}
            </Tooltip>
          ) : (
            chip
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 px-2 py-1">
        <Tooltip
          width={320}
          content={
            <>
              <TooltipTitle>UNIVERSAL FILTER</TooltipTitle>
              <div className="text-muted">
                Type text to match ticker, name, sector or group — or write an expression such as{' '}
                <span className="num text-text">rsi &lt; 30</span>,{' '}
                <span className="num text-text">change &gt; 3</span> or{' '}
                <span className="num text-text">volume &gt; 2x</span>. Combine with{' '}
                <span className="num text-text">and</span>.
              </div>
              <div className="mt-1.5 text-[10px]">
                <span className="label">FIELDS</span>
                <div className="num mt-0.5 leading-[14px] text-muted">
                  {EXPRESSION_FIELDS.join(' · ')}
                </div>
              </div>
            </>
          }
        >
          <div className="relative flex items-center">
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Filter: text, or rsi < 30 and change > 3"
              className="h-[22px] w-[300px] px-2 text-[11px]"
              style={{ borderColor: isExpression ? 'var(--orange)' : undefined }}
            />
            {query && (
              <button
                onClick={() => onQueryChange('')}
                className="absolute right-1 text-muted hover:text-orange"
              >
                <X size={10} />
              </button>
            )}
          </div>
        </Tooltip>

        {isExpression && (
          <span className="border border-orange px-1 text-[9px] font-semibold uppercase text-orange">
            {expressions!.length} expression{expressions!.length > 1 ? 's' : ''}
          </span>
        )}

        <button
          onClick={onToggleGrouped}
          className="flex h-[22px] items-center gap-1 border px-1.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{
            borderColor: grouped ? 'var(--orange)' : 'var(--border)',
            color: grouped ? 'var(--orange)' : 'var(--muted)',
          }}
        >
          <Layers size={10} />
          {grouped ? 'GROUPED' : 'FLAT'}
        </button>

        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
          <span className="num">
            {matched} / {total} securities
          </span>
          {(active.length > 0 || query) && (
            <button onClick={onClear} className="border border-border px-1.5 py-[2px] hover:border-orange hover:text-orange">
              CLEAR
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
