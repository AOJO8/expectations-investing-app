/** Rough session-state indicator for the header.
 *
 * Deliberately simple: US cash-equity hours in New York time, with no holiday
 * calendar. It labels the app's own clock, never the freshness of a quote -
 * that comes from each row's data status.
 */

export type MarketState = 'PRE' | 'OPEN' | 'POST' | 'CLOSED' | 'WEEKEND'

export interface MarketStatus {
  state: MarketState
  label: string
  color: string
  detail: string
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = ny.getDay()
  const minutes = ny.getHours() * 60 + ny.getMinutes()

  const open = 9 * 60 + 30
  const close = 16 * 60
  const preOpen = 4 * 60
  const postClose = 20 * 60

  if (day === 0 || day === 6) {
    return {
      state: 'WEEKEND',
      label: 'WEEKEND',
      color: 'var(--neutral)',
      detail: 'US equity markets are closed. Crypto trades continuously.',
    }
  }
  if (minutes >= open && minutes < close) {
    return {
      state: 'OPEN',
      label: 'US OPEN',
      color: 'var(--positive)',
      detail: 'US cash equities are in their regular session (09:30-16:00 ET).',
    }
  }
  if (minutes >= preOpen && minutes < open) {
    return {
      state: 'PRE',
      label: 'PRE-MARKET',
      color: 'var(--orange)',
      detail: 'US pre-market session (04:00-09:30 ET).',
    }
  }
  if (minutes >= close && minutes < postClose) {
    return {
      state: 'POST',
      label: 'AFTER HOURS',
      color: 'var(--orange)',
      detail: 'US after-hours session (16:00-20:00 ET).',
    }
  }
  return {
    state: 'CLOSED',
    label: 'US CLOSED',
    color: 'var(--neutral)',
    detail: 'US equity markets are closed. Holiday closures are not tracked.',
  }
}
