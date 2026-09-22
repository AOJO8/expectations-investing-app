/** Thin fetch wrapper. Every call goes through here; no component fetches directly. */

import type {
  HealthResponse,
  HistoryResponse,
  InstrumentsResponse,
  MarketSnapshot,
  SearchResult,
  SecurityRow,
  StripItem,
  Watchlist,
  WatchlistsResponse,
} from './types'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = body.detail ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, response.status)
  }
  return (await response.json()) as T
}

/** Symbols such as ^GSPC, BTC-USD and GC=F must survive the URL. */
const enc = (ticker: string) => encodeURIComponent(ticker)

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  market: (stage: 'quotes' | 'full' = 'full', tickers?: string[]) => {
    const params = new URLSearchParams({ stage })
    if (tickers?.length) params.set('tickers', tickers.join(','))
    return request<MarketSnapshot>(`/api/market?${params}`)
  },

  strip: () => request<{ items: StripItem[]; as_of: string }>('/api/strip'),

  instruments: () => request<InstrumentsResponse>('/api/instruments'),

  quote: (ticker: string) => request<SecurityRow>(`/api/quote/${enc(ticker)}`),

  history: (ticker: string, period: string, interval: string) =>
    request<HistoryResponse>(
      `/api/history/${enc(ticker)}?period=${period}&interval=${interval}`,
    ),

  technicals: (ticker: string) => request<Record<string, unknown>>(`/api/technicals/${enc(ticker)}`),

  search: (q: string) =>
    request<{ query: string; results: SearchResult[] }>(
      `/api/search?q=${encodeURIComponent(q)}`,
    ),

  watchlists: () => request<WatchlistsResponse>('/api/watchlists'),

  addToWatchlist: (id: number, ticker: string, group?: string) =>
    request<{ watchlist: Watchlist; validated: boolean }>(`/api/watchlists/${id}/instruments`, {
      method: 'POST',
      body: JSON.stringify({ ticker, group }),
    }),

  removeFromWatchlist: (id: number, ticker: string) =>
    request<Watchlist>(`/api/watchlists/${id}/instruments/${enc(ticker)}`, { method: 'DELETE' }),

  setFavourite: (ticker: string, favourite: boolean) =>
    request<{ favourites: string[] }>('/api/favourites', {
      method: 'POST',
      body: JSON.stringify({ ticker, favourite }),
    }),

  moveInstrument: (ticker: string, group: string) =>
    request<{ ticker: string; group: string }>('/api/instruments/move', {
      method: 'POST',
      body: JSON.stringify({ ticker, group }),
    }),
}
