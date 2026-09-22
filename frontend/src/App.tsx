import type { ColumnOrderState, ColumnSizingState, VisibilityState } from '@tanstack/react-table'
import { AlertTriangle, Info } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BreadthPanel } from './components/BreadthPanel'
import { DetailDrawer } from './components/DetailDrawer'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { MarketStrip } from './components/MarketStrip'
import { MonitorTable } from './components/MonitorTable'
import { NavTabs } from './components/NavTabs'
import { SearchPalette } from './components/SearchPalette'
import { SettingsDrawer } from './components/SettingsDrawer'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useMarket, usePriceTicks, useWatchlistActions, useWatchlists } from './hooks/useMarket'
import { useSettings, type ViewId } from './hooks/useSettings'
import { applyFilters } from './lib/filters'
import { ChartsView } from './views/ChartsView'
import { HeatmapView } from './views/HeatmapView'
import { TechnicalsView } from './views/TechnicalsView'

export default function App() {
  const { settings } = useSettings()
  const { snapshot, rows, isInitialLoading, isFetching, isHydrating, error, refresh, lastUpdated } =
    useMarket()
  const { data: watchlists } = useWatchlists()
  const defaultList = watchlists?.watchlists.find((w) => w.is_default)
  const { favourite } = useWatchlistActions(defaultList?.id)

  const [view, setView] = useState<ViewId>(settings.defaultView)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawerCollapsed, setDrawerCollapsed] = useState(false)
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [quickFilters, setQuickFilters] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [dismissedBanner, setDismissedBanner] = useState(false)

  // Layout state persisted per browser.
  const [collapsedGroups, setCollapsedGroups] = useLocalStorage<string[]>('ayo.collapsedGroups', [])
  const [columnVisibility, setColumnVisibility, resetVisibility] = useLocalStorage<VisibilityState>(
    'ayo.columnVisibility',
    {},
  )
  const [columnSizing, setColumnSizing, resetSizing] = useLocalStorage<ColumnSizingState>(
    'ayo.columnSizing',
    {},
  )
  const [columnOrder, setColumnOrder, resetOrder] = useLocalStorage<ColumnOrderState>(
    'ayo.columnOrder',
    [],
  )
  const [grouped, setGrouped] = useLocalStorage<boolean>('ayo.grouped', true)

  const ticks = usePriceTicks(rows, settings.flashPrices)

  const filtered = useMemo(
    () => applyFilters(rows, { quickFilters, query, favouritesOnly }),
    [rows, quickFilters, query, favouritesOnly],
  )

  const selectedRow = useMemo(
    () => rows.find((row) => row.ticker === selectedTicker) ?? null,
    [rows, selectedTicker],
  )

  const groupOrder = useMemo(() => snapshot?.groups.map((g) => g.name) ?? [], [snapshot])
  const groupCatalogue = useMemo(
    () => (groupOrder.length ? groupOrder : ['WATCHLIST']),
    [groupOrder],
  )

  const handleToggleFavourite = useCallback(
    (ticker: string) => {
      const row = rows.find((r) => r.ticker === ticker)
      favourite.mutate({ ticker, value: !row?.is_favourite })
    },
    [favourite, rows],
  )

  const handleToggleGroup = useCallback(
    (group: string) => {
      setCollapsedGroups((prev) =>
        prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
      )
    },
    [setCollapsedGroups],
  )

  const handleToggleQuickFilter = useCallback((id: string) => {
    if (id === 'all') {
      setQuickFilters([])
      return
    }
    setQuickFilters((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }, [])

  const resetLayout = () => {
    resetVisibility()
    resetSizing()
    resetOrder()
    setCollapsedGroups([])
    setSettingsOpen(false)
  }

  // ---- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable

      if (event.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (settingsOpen) setSettingsOpen(false)
        else if (selectedTicker) setSelectedTicker(null)
        return
      }
      if (typing) return

      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        void refresh()
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        setFavouritesOnly((prev) => !prev)
      } else if (event.key === 'Enter' && selectedTicker) {
        event.preventDefault()
        setDrawerCollapsed(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [refresh, searchOpen, selectedTicker, settingsOpen])

  const unavailable = (snapshot?.counts.UNAVAILABLE ?? 0) + (snapshot?.counts.DELISTED ?? 0)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Header
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => void refresh()}
        isFetching={isFetching}
        lastUpdated={lastUpdated}
        favouritesOnly={favouritesOnly}
        onToggleFavourites={() => setFavouritesOnly((prev) => !prev)}
      />

      {/* The thin orange rule under the header. */}
      <div className="h-[2px] shrink-0" style={{ background: 'var(--orange)' }} />

      <NavTabs
        active={view}
        onChange={setView}
        right={
          <div className="flex items-center gap-2 text-[9px] text-muted">
            {isHydrating && <span className="text-orange">hydrating technicals…</span>}
            <span className="num">{rows.length} securities</span>
            {unavailable > 0 && <span>· {unavailable} unavailable</span>}
          </div>
        }
      />

      <MarketStrip onSelect={setSelectedTicker} />

      {snapshot?.is_synthetic_source && !dismissedBanner && (
        <Banner
          tone="danger"
          onDismiss={() => setDismissedBanner(true)}
          icon={<AlertTriangle size={12} />}
        >
          SYNTHETIC FIXTURE DATA — these are not market prices. Start the backend without
          <span className="num"> AYO_PROVIDER=fixture </span> to use Yahoo Finance.
        </Banner>
      )}

      {snapshot?.provider_circuit?.open && (
        <Banner tone="danger" icon={<AlertTriangle size={12} />}>
          MARKET DATA FEED UNREACHABLE — {snapshot.counts.UNAVAILABLE ?? 0} securities could not be
          priced. Requests are failing fast for{' '}
          {Math.ceil(snapshot.provider_circuit.reopens_in)}s rather than hanging, then the provider
          is retried automatically. No prices are estimated while the feed is down.
        </Banner>
      )}

      {error && (
        <Banner tone="danger" icon={<AlertTriangle size={12} />}>
          Could not reach the market API: {error.message}. The worksheet is showing the last payload
          it received, if any.
        </Banner>
      )}

      {!snapshot?.is_synthetic_source && snapshot?.is_delayed && !dismissedBanner && (
        <Banner tone="info" onDismiss={() => setDismissedBanner(true)} icon={<Info size={12} />}>
          Prices are sourced from Yahoo Finance and are delayed — typically around 15 minutes for US
          equities, longer on some venues. Technical labels describe past prices and are not
          investment advice.
        </Banner>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {view === 'monitor' && (
            <>
              <FilterBar
                active={quickFilters}
                onToggle={handleToggleQuickFilter}
                query={query}
                onQueryChange={setQuery}
                grouped={grouped}
                onToggleGrouped={() => setGrouped((prev) => !prev)}
                matched={filtered.length}
                total={rows.length}
                onClear={() => {
                  setQuickFilters([])
                  setQuery('')
                }}
              />
              <MonitorTable
                rows={filtered}
                groupOrder={groupOrder}
                grouped={grouped}
                isLoading={isInitialLoading}
                selectedTicker={selectedTicker}
                onSelect={setSelectedTicker}
                onToggleFavourite={handleToggleFavourite}
                ticks={ticks}
                collapsedGroups={collapsedGroups}
                onToggleGroup={handleToggleGroup}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnSizing={columnSizing}
                onColumnSizingChange={setColumnSizing}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
              />
            </>
          )}

          {view === 'charts' && (
            <ChartsView rows={rows} selectedTicker={selectedTicker} onSelect={setSelectedTicker} />
          )}

          {view === 'heatmap' && <HeatmapView rows={rows} onSelect={setSelectedTicker} />}

          {view === 'technicals' && (
            <TechnicalsView
              rows={filtered}
              onSelect={setSelectedTicker}
              selectedTicker={selectedTicker}
              isHydrating={isHydrating}
            />
          )}
        </div>

        {view === 'monitor' && (
          <BreadthPanel breadth={snapshot?.breadth} rows={rows} onSelect={setSelectedTicker} />
        )}

        <DetailDrawer
          row={selectedRow}
          onClose={() => setSelectedTicker(null)}
          collapsed={drawerCollapsed}
          onToggleCollapse={() => setDrawerCollapsed((prev) => !prev)}
          onToggleFavourite={handleToggleFavourite}
        />
      </div>

      <footer className="flex h-[20px] shrink-0 items-center gap-3 border-t border-border bg-panel px-2 text-[9px] text-muted">
        <span className="label">AYO</span>
        <span>
          Source: {snapshot?.data_source ?? '—'} · {snapshot?.disclaimer ?? 'Awaiting first snapshot.'}
        </span>
        <span className="ml-auto">/ search · R refresh · F favourites · ↑↓ navigate · Esc close</span>
      </footer>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        rows={rows}
        groups={groupCatalogue}
        onSelect={setSelectedTicker}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        onResetLayout={resetLayout}
        provider={snapshot?.data_source}
        isSynthetic={Boolean(snapshot?.is_synthetic_source)}
      />
    </div>
  )
}

function Banner({
  tone,
  children,
  onDismiss,
  icon,
}: {
  tone: 'danger' | 'info'
  children: React.ReactNode
  onDismiss?: () => void
  icon?: React.ReactNode
}) {
  const color = tone === 'danger' ? 'var(--negative)' : 'var(--orange)'
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-[10px]"
      style={{
        borderColor: color,
        background: tone === 'danger' ? 'rgba(234,57,67,0.10)' : 'rgba(255,159,28,0.08)',
        color,
      }}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-[9px] uppercase tracking-wider opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  )
}
