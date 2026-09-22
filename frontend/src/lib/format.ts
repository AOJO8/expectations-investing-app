/** Number, price and currency formatting for the worksheet.
 *
 * Rule that runs through all of it: a missing value renders as an em dash.
 * Nothing is ever defaulted to zero.
 */

export const DASH = '—'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  GBp: '', // pence, suffixed instead
  JPY: '¥',
  HKD: 'HK$',
  KRW: '₩',
  CHF: 'CHF ',
  CAD: 'C$',
  AUD: 'A$',
}

export function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Decimal places appropriate to the magnitude of the instrument's price. */
export function priceDecimals(value: number, assetClass?: string): number {
  const abs = Math.abs(value)
  if (assetClass === 'CRYPTO') {
    if (abs < 1) return 6
    if (abs < 100) return 4
    return 2
  }
  if (abs === 0) return 2
  if (abs < 1) return 4
  if (abs < 10) return 3
  if (abs >= 10000) return 2
  return 2
}

export function formatPrice(
  value: number | null | undefined,
  assetClass?: string,
  decimals?: number,
): string {
  if (!isNum(value)) return DASH
  const dp = decimals ?? priceDecimals(value, assetClass)
  return value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** Price with its native currency marker. GBp is shown in pence. */
export function formatCurrencyPrice(
  value: number | null | undefined,
  currency: string | null | undefined,
  assetClass?: string,
): string {
  if (!isNum(value)) return DASH
  const body = formatPrice(value, assetClass)
  if (!currency) return body
  if (currency === 'GBp') return `${body}p`
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol ? `${symbol}${body}` : `${body} ${currency}`
}

export function currencyLabel(currency: string | null | undefined): string {
  if (!currency) return DASH
  return currency === 'GBp' ? 'GBp (pence)' : currency
}

export function formatPct(value: number | null | undefined, withSign = true): string {
  if (!isNum(value)) return DASH
  const sign = withSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatChange(value: number | null | undefined, assetClass?: string): string {
  if (!isNum(value)) return DASH
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPrice(value, assetClass)}`
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (!isNum(value)) return DASH
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** 1.42T / 238.5B / 4.7M - human-readable magnitudes. */
export function formatCompact(value: number | null | undefined, decimals = 2): string {
  if (!isNum(value)) return DASH
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [scale, suffix] of units) {
    if (abs >= scale) {
      const scaled = abs / scale
      const dp = scaled >= 100 ? 1 : decimals
      return `${sign}${scaled.toFixed(dp)}${suffix}`
    }
  }
  return `${sign}${abs.toFixed(abs < 10 ? 2 : 0)}`
}

export function formatVolume(value: number | null | undefined): string {
  if (!isNum(value)) return DASH
  return formatCompact(value, 1)
}

export function formatMultiple(value: number | null | undefined): string {
  if (!isNum(value)) return DASH
  return `${value.toFixed(2)}x`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return DASH
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return DASH
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}
