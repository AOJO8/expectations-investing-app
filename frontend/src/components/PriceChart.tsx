import {
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle } from '../api/types'

export type ChartKind = 'line' | 'candlestick'
export type OverlayId = 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'ema50'

export const OVERLAY_META: Record<OverlayId, { label: string; color: string; period: number; type: 'sma' | 'ema' }> = {
  sma20: { label: 'SMA 20', color: '#4aa3ff', period: 20, type: 'sma' },
  sma50: { label: 'SMA 50', color: '#ff9f1c', period: 50, type: 'sma' },
  sma200: { label: 'SMA 200', color: '#b57bff', period: 200, type: 'sma' },
  ema20: { label: 'EMA 20', color: '#16c784', period: 20, type: 'ema' },
  ema50: { label: 'EMA 50', color: '#ea3943', period: 50, type: 'ema' },
}

const CHART_THEME = {
  layout: {
    background: { color: '#0d1115' },
    textColor: '#9ba3af',
    fontSize: 10,
    fontFamily: 'IBM Plex Mono, monospace',
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: 'rgba(35, 42, 49, 0.5)' },
    horzLines: { color: 'rgba(35, 42, 49, 0.5)' },
  },
  rightPriceScale: { borderColor: '#232a31' },
  timeScale: { borderColor: '#232a31', timeVisible: true, secondsVisible: false },
  crosshair: {
    vertLine: { color: '#ff9f1c', width: 1 as const, style: 3, labelBackgroundColor: '#ff9f1c' },
    horzLine: { color: '#ff9f1c', width: 1 as const, style: 3, labelBackgroundColor: '#ff9f1c' },
  },
}

function toTime(iso: string): UTCTimestamp {
  return (new Date(iso).getTime() / 1000) as UTCTimestamp
}

/** Moving averages computed client-side over exactly the visible candles. */
export function movingAverage(
  candles: Candle[],
  period: number,
  kind: 'sma' | 'ema',
): LineData[] {
  const out: LineData[] = []
  const closes: number[] = []
  const alpha = 2 / (period + 1)
  let ema: number | null = null
  let sum = 0

  for (const candle of candles) {
    if (typeof candle.c !== 'number') continue
    closes.push(candle.c)
    sum += candle.c
    if (closes.length > period) sum -= closes[closes.length - period - 1]

    if (closes.length < period) continue
    if (kind === 'sma') {
      out.push({ time: toTime(candle.t) as Time, value: sum / period })
    } else {
      ema = ema === null ? sum / period : alpha * candle.c + (1 - alpha) * ema
      out.push({ time: toTime(candle.t) as Time, value: ema })
    }
  }
  return out
}

interface PriceChartProps {
  candles: Candle[]
  kind: ChartKind
  overlays: OverlayId[]
  height?: number
}

export function PriceChart({ candles, kind, overlays, height = 230 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null)
  const overlayRefs = useRef<Map<OverlayId, ISeriesApi<'Line'>>>(new Map())

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      ...CHART_THEME,
      width: containerRef.current.clientWidth,
      height,
    })
    chartRef.current = chart

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) chart.applyOptions({ width })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      overlayRefs.current.clear()
    }
  }, [height])

  // Main price series - recreated when the chart type changes.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current)
      mainSeriesRef.current = null
    }

    const usable = candles.filter((c) => typeof c.c === 'number')
    if (!usable.length) return

    if (kind === 'candlestick') {
      const series = chart.addCandlestickSeries({
        upColor: '#16c784',
        downColor: '#ea3943',
        borderUpColor: '#16c784',
        borderDownColor: '#ea3943',
        wickUpColor: '#16c784',
        wickDownColor: '#ea3943',
      })
      const data: CandlestickData[] = usable
        .filter((c) => c.o !== null && c.h !== null && c.l !== null)
        .map((c) => ({
          time: toTime(c.t) as Time,
          open: c.o!,
          high: c.h!,
          low: c.l!,
          close: c.c!,
        }))
      series.setData(data)
      mainSeriesRef.current = series
    } else {
      const rising = (usable[usable.length - 1].c ?? 0) >= (usable[0].c ?? 0)
      const series = chart.addAreaSeries({
        lineColor: rising ? '#16c784' : '#ea3943',
        topColor: rising ? 'rgba(22,199,132,0.22)' : 'rgba(234,57,67,0.22)',
        bottomColor: 'rgba(13,17,21,0)',
        lineWidth: 2,
      })
      series.setData(usable.map((c) => ({ time: toTime(c.t) as Time, value: c.c! })))
      mainSeriesRef.current = series
    }

    chart.timeScale().fitContent()
  }, [candles, kind])

  // Overlays.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    for (const [id, series] of overlayRefs.current) {
      if (!overlays.includes(id)) {
        chart.removeSeries(series)
        overlayRefs.current.delete(id)
      }
    }

    for (const id of overlays) {
      const meta = OVERLAY_META[id]
      const data = movingAverage(candles, meta.period, meta.type)
      if (!data.length) continue
      let series = overlayRefs.current.get(id)
      if (!series) {
        series = chart.addLineSeries({
          color: meta.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        overlayRefs.current.set(id, series)
      }
      series.setData(data)
    }
  }, [candles, overlays])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
