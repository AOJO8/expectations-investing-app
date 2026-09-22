import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { MarketSnapshot, SecurityRow } from '../api/types'
import { useSettings } from './useSettings'

const MARKET_KEY = ['market'] as const

/**
 * Staged loading: the quote snapshot renders the table immediately, then the
 * full payload (with technicals) replaces it. Refetches never clear the cached
 * rows, so sorting, scrolling and selection survive an auto-refresh.
 */
export function useMarket() {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<'quotes' | 'full'>('quotes')

  const quotes = useQuery({
    queryKey: [...MARKET_KEY, 'quotes'],
    queryFn: () => api.market('quotes'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const full = useQuery({
    queryKey: [...MARKET_KEY, 'full'],
    queryFn: () => api.market('full'),
    // Only start the heavy request once the fast one has painted.
    enabled: quotes.isSuccess,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: settings.refreshInterval ? settings.refreshInterval * 1000 : false,
    placeholderData: (previous) => previous,
  })

  useEffect(() => {
    if (full.isSuccess) setStage('full')
  }, [full.isSuccess])

  const snapshot: MarketSnapshot | undefined = full.data ?? quotes.data

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...MARKET_KEY, 'quotes'] }),
      queryClient.invalidateQueries({ queryKey: [...MARKET_KEY, 'full'] }),
    ])
  }

  return {
    snapshot,
    rows: snapshot?.rows ?? [],
    stage,
    isInitialLoading: quotes.isLoading && !quotes.data,
    isFetching: quotes.isFetching || full.isFetching,
    isHydrating: quotes.isSuccess && !full.isSuccess,
    error: (quotes.error ?? full.error) as Error | null,
    refresh,
    lastUpdated: snapshot?.as_of ?? null,
  }
}

export function useMarketStrip() {
  const { settings } = useSettings()
  return useQuery({
    queryKey: ['strip'],
    queryFn: () => api.strip(),
    refetchInterval: settings.refreshInterval ? settings.refreshInterval * 1000 : false,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => api.health(), staleTime: 300_000 })
}

export function useWatchlists() {
  return useQuery({ queryKey: ['watchlists'], queryFn: () => api.watchlists(), staleTime: 60_000 })
}

export function useHistory(ticker: string | null, period: string, interval: string) {
  return useQuery({
    queryKey: ['history', ticker, period, interval],
    queryFn: () => api.history(ticker!, period, interval),
    enabled: Boolean(ticker),
    staleTime: 120_000,
  })
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
  })
}

/** Watchlist mutations, invalidating the worksheet so the row moves sections. */
export function useWatchlistActions(watchlistId: number | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: MARKET_KEY })
    queryClient.invalidateQueries({ queryKey: ['watchlists'] })
  }

  const add = useMutation({
    mutationFn: ({ ticker, group }: { ticker: string; group?: string }) =>
      api.addToWatchlist(watchlistId!, ticker, group),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (ticker: string) => api.removeFromWatchlist(watchlistId!, ticker),
    onSuccess: invalidate,
  })

  const favourite = useMutation({
    mutationFn: ({ ticker, value }: { ticker: string; value: boolean }) =>
      api.setFavourite(ticker, value),
    onSuccess: invalidate,
  })

  const move = useMutation({
    mutationFn: ({ ticker, group }: { ticker: string; group: string }) =>
      api.moveInstrument(ticker, group),
    onSuccess: invalidate,
  })

  return { add, remove, favourite, move, ready: watchlistId !== undefined }
}

/**
 * Track the previous rendered price per ticker so a cell can flash on a tick.
 * Returns a map of ticker -> direction for the most recent change only.
 */
export function usePriceTicks(rows: SecurityRow[], enabled: boolean) {
  const previous = useRef<Map<string, number>>(new Map())
  const [ticks, setTicks] = useState<Map<string, 'up' | 'down'>>(new Map())

  useEffect(() => {
    if (!enabled) return
    const next = new Map<string, 'up' | 'down'>()
    for (const row of rows) {
      if (typeof row.last !== 'number') continue
      const before = previous.current.get(row.ticker)
      if (typeof before === 'number' && before !== row.last) {
        next.set(row.ticker, row.last > before ? 'up' : 'down')
      }
      previous.current.set(row.ticker, row.last)
    }
    if (next.size) {
      setTicks(next)
      const timer = window.setTimeout(() => setTicks(new Map()), 700)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [rows, enabled])

  return ticks
}

/** Group rows into worksheet sections, preserving the configured order. */
export function useGroupedRows(rows: SecurityRow[], groupOrder: string[]) {
  return useMemo(() => {
    const buckets = new Map<string, SecurityRow[]>()
    for (const row of rows) {
      const groups = row.groups.length ? row.groups : ['UNGROUPED']
      for (const group of groups) {
        const bucket = buckets.get(group)
        if (bucket) bucket.push(row)
        else buckets.set(group, [row])
      }
    }
    const ordered = [...buckets.keys()].sort((a, b) => {
      const ia = groupOrder.indexOf(a)
      const ib = groupOrder.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    return ordered.map((name) => ({ name, rows: buckets.get(name)! }))
  }, [rows, groupOrder])
}
