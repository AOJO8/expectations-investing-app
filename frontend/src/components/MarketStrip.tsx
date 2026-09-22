import { formatPct, formatPrice } from '../lib/format'
import { directionColor } from '../lib/heat'
import { useMarketStrip } from '../hooks/useMarket'

/** The tape under the navigation. Click an entry to open its detail drawer. */
export function MarketStrip({ onSelect }: { onSelect: (ticker: string) => void }) {
  const { data, isLoading } = useMarketStrip()

  if (isLoading && !data) {
    return (
      <div className="flex h-[26px] shrink-0 items-center gap-6 border-b border-border bg-panel px-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="skeleton h-[8px] w-[92px]" />
        ))}
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className="flex h-[26px] shrink-0 items-center gap-0 overflow-x-auto border-b border-border bg-panel">
      {items.map((item) => {
        const unavailable = item.last === null
        return (
          <button
            key={item.ticker}
            onClick={() => onSelect(item.ticker)}
            title={`${item.name} · ${item.status}`}
            className="flex shrink-0 items-baseline gap-1.5 border-r border-border px-3 hover:bg-panel-secondary"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {item.short_name}
            </span>
            {unavailable ? (
              <span className="num text-[11px] text-muted">unavailable</span>
            ) : (
              <>
                <span className="num text-[11px] text-text">
                  {formatPrice(item.last, item.asset_class)}
                </span>
                <span className="num text-[10px]" style={{ color: directionColor(item.change_pct) }}>
                  {formatPct(item.change_pct)}
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
