import { useMemo } from 'react'
import type { Candle } from '../api/types'
import { formatNumber, formatVolume } from '../lib/format'

/** Compact SVG panes beneath the price chart: volume, RSI and MACD. */

function closes(candles: Candle[]): { time: string; close: number }[] {
  return candles
    .filter((c): c is Candle & { c: number } => typeof c.c === 'number')
    .map((c) => ({ time: c.t, close: c.c }))
}

function rsiSeries(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length <= period) return out
  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1]
    gains.push(Math.max(delta, 0))
    losses.push(Math.max(-delta, 0))
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  const rsiAt = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss))
  out[period] = rsiAt()
  for (let i = period; i < gains.length; i += 1) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    out[i + 1] = rsiAt()
  }
  return out
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  if (values.length < period) return out
  const alpha = 2 / (period + 1)
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = ema
  for (let i = period; i < values.length; i += 1) {
    ema = alpha * values[i] + (1 - alpha) * ema
    out[i] = ema
  }
  return out
}

function macdSeries(values: number[]) {
  const fast = emaSeries(values, 12)
  const slow = emaSeries(values, 26)
  const macd = values.map((_, i) =>
    fast[i] !== null && slow[i] !== null ? (fast[i] as number) - (slow[i] as number) : null,
  )
  const defined = macd.filter((v): v is number => v !== null)
  const signalDefined = emaSeries(defined, 9)
  const offset = macd.findIndex((v) => v !== null)
  const signal = macd.map((_, i) =>
    i >= offset && signalDefined[i - offset] !== undefined ? signalDefined[i - offset] : null,
  )
  const histogram = macd.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null))
  return { macd, signal, histogram }
}

interface PaneProps {
  candles: Candle[]
  width?: number
  height?: number
}

export function VolumePane({ candles, height = 52 }: PaneProps) {
  const bars = candles.filter((c) => typeof c.v === 'number' && typeof c.c === 'number')
  if (bars.length < 2) return <EmptyPane label="VOLUME" height={height} />
  const max = Math.max(...bars.map((b) => b.v as number)) || 1
  const barWidth = 100 / bars.length

  return (
    <PaneFrame title="VOLUME" value={formatVolume(bars[bars.length - 1].v)} height={height}>
      <svg width="100%" height={height - 16} viewBox={`0 0 100 ${height - 16}`} preserveAspectRatio="none">
        {bars.map((bar, index) => {
          const previous = index > 0 ? (bars[index - 1].c as number) : (bar.c as number)
          const up = (bar.c as number) >= previous
          const barHeight = ((bar.v as number) / max) * (height - 18)
          return (
            <rect
              key={bar.t}
              x={index * barWidth}
              y={height - 16 - barHeight}
              width={Math.max(barWidth * 0.78, 0.4)}
              height={barHeight}
              fill={up ? 'rgba(22,199,132,0.55)' : 'rgba(234,57,67,0.55)'}
            />
          )
        })}
      </svg>
    </PaneFrame>
  )
}

export function RsiPane({ candles, height = 62 }: PaneProps) {
  const data = useMemo(() => closes(candles), [candles])
  const values = useMemo(() => rsiSeries(data.map((d) => d.close)), [data])
  const defined = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null)
  if (defined.length < 2) return <EmptyPane label="RSI 14" height={height} />

  const inner = height - 16
  const toY = (value: number) => inner - (value / 100) * inner
  const points = defined
    .map((p) => `${((p.i / (values.length - 1)) * 100).toFixed(2)},${toY(p.v as number).toFixed(2)}`)
    .join(' ')
  const latest = defined[defined.length - 1].v as number

  return (
    <PaneFrame
      title="RSI 14"
      value={latest.toFixed(1)}
      valueColor={latest >= 70 ? 'var(--negative)' : latest <= 30 ? 'var(--positive)' : 'var(--text)'}
      height={height}
    >
      <svg width="100%" height={inner} viewBox={`0 0 100 ${inner}`} preserveAspectRatio="none">
        <rect x="0" y={toY(70)} width="100" height={toY(30) - toY(70)} fill="rgba(255,159,28,0.05)" />
        <line x1="0" y1={toY(70)} x2="100" y2={toY(70)} stroke="var(--negative)" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.6" />
        <line x1="0" y1={toY(50)} x2="100" y2={toY(50)} stroke="var(--border)" strokeWidth="0.3" />
        <line x1="0" y1={toY(30)} x2="100" y2={toY(30)} stroke="var(--positive)" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.6" />
        <polyline points={points} fill="none" stroke="var(--orange)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </PaneFrame>
  )
}

export function MacdPane({ candles, height = 62 }: PaneProps) {
  const data = useMemo(() => closes(candles), [candles])
  const series = useMemo(() => macdSeries(data.map((d) => d.close)), [data])
  const hist = series.histogram
  const defined = hist.filter((v): v is number => v !== null)
  if (defined.length < 2) return <EmptyPane label="MACD 12/26/9" height={height} />

  const inner = height - 16
  const bound = Math.max(...defined.map(Math.abs)) || 1
  const mid = inner / 2
  const barWidth = 100 / hist.length
  const latest = defined[defined.length - 1]

  const line = (values: (number | null)[], color: string) => {
    const points = values
      .map((v, i) => (v === null ? null : `${((i / (values.length - 1)) * 100).toFixed(2)},${(mid - (v / bound) * mid).toFixed(2)}`))
      .filter((p): p is string => p !== null)
      .join(' ')
    return <polyline points={points} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
  }

  return (
    <PaneFrame
      title="MACD 12/26/9"
      value={formatNumber(latest, 3)}
      valueColor={latest >= 0 ? 'var(--positive)' : 'var(--negative)'}
      height={height}
    >
      <svg width="100%" height={inner} viewBox={`0 0 100 ${inner}`} preserveAspectRatio="none">
        <line x1="0" y1={mid} x2="100" y2={mid} stroke="var(--border)" strokeWidth="0.3" />
        {hist.map((value, index) =>
          value === null ? null : (
            <rect
              key={index}
              x={index * barWidth}
              y={value >= 0 ? mid - (value / bound) * mid : mid}
              width={Math.max(barWidth * 0.78, 0.4)}
              height={Math.abs((value / bound) * mid)}
              fill={value >= 0 ? 'rgba(22,199,132,0.6)' : 'rgba(234,57,67,0.6)'}
            />
          ),
        )}
        {line(series.macd, 'var(--orange)')}
        {line(series.signal, '#4aa3ff')}
      </svg>
    </PaneFrame>
  )
}

function PaneFrame({
  title,
  value,
  valueColor,
  height,
  children,
}: {
  title: string
  value: string
  valueColor?: string
  height: number
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border" style={{ height }}>
      <div className="flex items-center justify-between px-2 pt-[2px]">
        <span className="label">{title}</span>
        <span className="num text-[10px]" style={{ color: valueColor ?? 'var(--text)' }}>
          {value}
        </span>
      </div>
      {children}
    </div>
  )
}

function EmptyPane({ label, height }: { label: string; height: number }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-2" style={{ height }}>
      <span className="label">{label}</span>
      <span className="text-[10px] text-muted">Not enough history</span>
    </div>
  )
}
