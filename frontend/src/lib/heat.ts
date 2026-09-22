/** Conditional formatting: the heat ramp applied to change and change %. */

export type HeatLevel = -3 | -2 | -1 | 0 | 1 | 2 | 3

/**
 * Bucket a percentage move:
 *   0 to 1%    subtle
 *   1 to 3%    stronger
 *   >= 3%      bright
 */
export function heatLevel(changePct: number | null | undefined): HeatLevel {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct) || changePct === 0) return 0
  const abs = Math.abs(changePct)
  const magnitude = abs >= 3 ? 3 : abs >= 1 ? 2 : 1
  return (changePct > 0 ? magnitude : -magnitude) as HeatLevel
}

const BACKGROUNDS: Record<HeatLevel, string> = {
  [-3]: 'var(--neg-3)',
  [-2]: 'var(--neg-2)',
  [-1]: 'var(--neg-1)',
  0: 'transparent',
  1: 'var(--pos-1)',
  2: 'var(--pos-2)',
  3: 'var(--pos-3)',
}

const FOREGROUNDS: Record<HeatLevel, string> = {
  [-3]: '#ff6b73',
  [-2]: 'var(--negative)',
  [-1]: '#d9636a',
  0: 'var(--neutral)',
  1: '#4bbd8e',
  2: 'var(--positive)',
  3: '#2bf0a3',
}

export function heatStyle(
  changePct: number | null | undefined,
  { background = true }: { background?: boolean } = {},
): React.CSSProperties {
  const level = heatLevel(changePct)
  return {
    color: FOREGROUNDS[level],
    ...(background ? { backgroundColor: BACKGROUNDS[level] } : {}),
    fontWeight: Math.abs(level) >= 3 ? 600 : Math.abs(level) >= 2 ? 500 : 400,
  }
}

/** Directional colour only, no fill - used for return columns. */
export function directionColor(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 'var(--neutral)'
  return value > 0 ? 'var(--positive)' : 'var(--negative)'
}

/** Continuous colour for the heatmap tiles. */
export function heatmapColor(changePct: number | null | undefined): string {
  if (typeof changePct !== 'number' || !Number.isFinite(changePct)) return '#1a2027'
  const clamped = Math.max(-5, Math.min(5, changePct))
  const intensity = Math.min(1, Math.abs(clamped) / 5)
  const alpha = 0.14 + intensity * 0.72
  return clamped >= 0 ? `rgba(22, 199, 132, ${alpha})` : `rgba(234, 57, 67, ${alpha})`
}

export function rsiColor(rsi: number | null | undefined): string {
  if (typeof rsi !== 'number' || !Number.isFinite(rsi)) return 'var(--muted)'
  if (rsi >= 70) return 'var(--negative)'
  if (rsi >= 55) return 'var(--orange)'
  if (rsi >= 45) return 'var(--neutral)'
  if (rsi > 30) return '#4bbd8e'
  return 'var(--positive)'
}

export function trendColor(trend: string | null | undefined): string {
  switch (trend) {
    case 'STRONG UPTREND':
      return '#2bf0a3'
    case 'UPTREND':
      return 'var(--positive)'
    case 'DOWNTREND':
      return 'var(--negative)'
    case 'STRONG DOWNTREND':
      return '#ff6b73'
    default:
      return 'var(--neutral)'
  }
}

export function signalColor(signal: string | null | undefined): string {
  switch (signal) {
    case 'STRONG BUY':
      return '#2bf0a3'
    case 'BUY':
      return 'var(--positive)'
    case 'SELL':
      return 'var(--negative)'
    case 'STRONG SELL':
      return '#ff6b73'
    default:
      return 'var(--neutral)'
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'OK':
      return 'var(--positive)'
    case 'DELAYED':
      return 'var(--orange)'
    case 'STALE':
      return '#c9a227'
    case 'UNAVAILABLE':
    case 'DELISTED':
      return 'var(--muted)'
    case 'NO_HISTORY':
      return 'var(--neutral)'
    default:
      return 'var(--negative)'
  }
}
