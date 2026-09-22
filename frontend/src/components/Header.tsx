import { RefreshCw, Search, Settings as SettingsIcon, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeTime, formatTime } from '../lib/format'
import { getMarketStatus } from '../lib/market-hours'
import { useSettings, type RefreshInterval } from '../hooks/useSettings'
import { Tooltip, TooltipTitle } from './Tooltip'

interface HeaderProps {
  onOpenSearch: () => void
  onOpenSettings: () => void
  onRefresh: () => void
  isFetching: boolean
  lastUpdated: string | null
  favouritesOnly: boolean
  onToggleFavourites: () => void
}

const INTERVALS: { value: RefreshInterval; label: string }[] = [
  { value: 0, label: 'OFF' },
  { value: 30, label: '30S' },
  { value: 60, label: '1M' },
  { value: 300, label: '5M' },
]

export function Header({
  onOpenSearch,
  onOpenSettings,
  onRefresh,
  isFetching,
  lastUpdated,
  favouritesOnly,
  onToggleFavourites,
}: HeaderProps) {
  const { settings, update } = useSettings()
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const status = getMarketStatus(clock)

  return (
    <header className="flex h-[46px] shrink-0 items-center gap-3 bg-panel px-3">
      <div className="flex items-baseline gap-2">
        <h1 className="text-[15px] font-bold tracking-[0.14em] text-orange">AYO MARKET MONITOR</h1>
        <span className="hidden text-[9px] uppercase tracking-[0.22em] text-muted md:inline">
          Multi-Asset Workspace
        </span>
      </div>

      <button
        onClick={onOpenSearch}
        className="group ml-3 flex h-[26px] min-w-[190px] flex-1 max-w-[340px] items-center gap-2 border border-border bg-panel-secondary px-2 text-left text-[11px] text-muted hover:border-orange/60"
      >
        <Search size={12} className="text-muted group-hover:text-orange" />
        <span>Search securities…</span>
        <kbd className="ml-auto border border-border px-1 text-[9px] text-muted">/</kbd>
      </button>

      <div className="ml-auto flex items-center gap-3">
        <Tooltip
          content={
            <>
              <TooltipTitle>MARKET STATUS</TooltipTitle>
              <div className="text-muted">{status.detail}</div>
              <div className="mt-1.5 num text-[10px]">
                {clock.toLocaleTimeString('en-GB')} local ·{' '}
                {clock.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })} ET
              </div>
            </>
          }
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
            <span
              className={`inline-block h-[6px] w-[6px] rounded-full ${status.state === 'OPEN' ? 'pulse' : ''}`}
              style={{ background: status.color }}
            />
            <span style={{ color: status.color }}>{status.label}</span>
          </span>
        </Tooltip>

        <button
          onClick={onToggleFavourites}
          title="Favourites only (F)"
          className="flex h-[24px] items-center gap-1 border px-1.5 text-[10px] font-semibold uppercase"
          style={{
            borderColor: favouritesOnly ? 'var(--orange)' : 'var(--border)',
            color: favouritesOnly ? 'var(--orange)' : 'var(--muted)',
          }}
        >
          <Star size={11} fill={favouritesOnly ? 'var(--orange)' : 'none'} />
          FAV
        </button>

        <div className="flex items-center gap-1.5">
          <span className="label">AUTO</span>
          <div className="flex border border-border">
            {INTERVALS.map((option) => (
              <button
                key={option.value}
                onClick={() => update('refreshInterval', option.value)}
                className="px-1.5 py-[3px] text-[10px] font-semibold"
                style={{
                  background:
                    settings.refreshInterval === option.value ? 'var(--orange)' : 'transparent',
                  color: settings.refreshInterval === option.value ? '#0b0d10' : 'var(--muted)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Tooltip
          content={
            <>
              <TooltipTitle>LAST UPDATED</TooltipTitle>
              <div className="text-muted">
                {lastUpdated
                  ? `Snapshot taken at ${formatTime(lastUpdated)} (${formatRelativeTime(lastUpdated)}).`
                  : 'No snapshot has completed yet.'}
              </div>
            </>
          }
        >
          <span className="num text-[10px] text-muted">
            {lastUpdated ? formatTime(lastUpdated) : '--:--:--'}
          </span>
        </Tooltip>

        <button
          onClick={onRefresh}
          title="Refresh (R)"
          className="flex h-[24px] w-[24px] items-center justify-center border border-border text-muted hover:border-orange hover:text-orange"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings"
          className="flex h-[24px] w-[24px] items-center justify-center border border-border text-muted hover:border-orange hover:text-orange"
        >
          <SettingsIcon size={12} />
        </button>
      </div>
    </header>
  )
}
