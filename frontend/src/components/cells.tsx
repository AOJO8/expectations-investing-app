import { Star } from 'lucide-react'
import type { SecurityRow } from '../api/types'
import {
  DASH,
  formatCompact,
  formatCurrencyPrice,
  formatNumber,
  formatPct,
  formatPrice,
  formatTime,
  formatVolume,
  isNum,
} from '../lib/format'
import { directionColor, heatStyle, rsiColor, signalColor, trendColor } from '../lib/heat'
import { Sparkline } from './Sparkline'
import { StatusPill } from './StatusPill'
import { Tooltip, TooltipRow, TooltipTitle } from './Tooltip'

/** A value that has not hydrated yet shows a shimmer, not a zero.
 *
 * A row the provider could not resolve is *settled*, not pending, so it shows
 * an em dash - a permanent shimmer would imply data is still on its way.
 */
export function Pending({
  loaded,
  row,
  children,
}: {
  loaded: boolean
  row?: SecurityRow
  children: React.ReactNode
}) {
  if (loaded) return <>{children}</>
  if (row && UNRESOLVED.has(row.status)) return <span className="text-muted">{DASH}</span>
  return <span className="skeleton inline-block h-[8px] w-[80%]" />
}

const UNRESOLVED = new Set(['UNAVAILABLE', 'DELISTED', 'ERROR', 'NO_HISTORY'])

export function SecurityCell({
  row,
  onToggleFavourite,
}: {
  row: SecurityRow
  onToggleFavourite: (ticker: string) => void
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavourite(row.ticker)
        }}
        title={row.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
        className="shrink-0 text-muted hover:text-orange"
      >
        <Star
          size={10}
          fill={row.is_favourite ? 'var(--orange)' : 'none'}
          color={row.is_favourite ? 'var(--orange)' : 'currentColor'}
        />
      </button>
      <span className="truncate text-[11px] text-text" title={row.name}>
        {row.name}
      </span>
      {row.note && (
        <Tooltip content={<div className="text-muted">{row.note}</div>}>
          <span className="shrink-0 text-[9px] text-orange">ⓘ</span>
        </Tooltip>
      )}
    </span>
  )
}

export function TickerCell({ row }: { row: SecurityRow }) {
  const dim = row.last === null
  return (
    <span
      className="num truncate text-[11px] font-medium"
      style={{ color: dim ? 'var(--muted)' : 'var(--orange)' }}
    >
      {row.ticker}
    </span>
  )
}

export function PriceCell({
  row,
  tick,
  flash,
}: {
  row: SecurityRow
  tick?: 'up' | 'down'
  flash: boolean
}) {
  if (!isNum(row.last)) return <span className="num text-muted">{DASH}</span>
  return (
    <span
      key={flash && tick ? `${row.ticker}-${row.last}` : undefined}
      className={`num w-full text-right text-[11px] ${flash && tick ? (tick === 'up' ? 'flash-up' : 'flash-down') : ''}`}
    >
      {formatCurrencyPrice(row.last, row.currency, row.asset_class)}
    </span>
  )
}

/** Change % - the strongest visual signal in the worksheet. */
export function ChangePctCell({ row }: { row: SecurityRow }) {
  if (!isNum(row.change_pct)) return <span className="num text-muted">{DASH}</span>
  return (
    <span
      className="num -mx-[7px] flex h-full w-[calc(100%+14px)] items-center justify-end px-[7px] text-[11px]"
      style={heatStyle(row.change_pct)}
    >
      {formatPct(row.change_pct)}
    </span>
  )
}

export function ChangeCell({ row }: { row: SecurityRow }) {
  if (!isNum(row.change)) return <span className="num text-muted">{DASH}</span>
  // Colour only: the filled heat block is reserved for Change %, so it stays
  // the single strongest signal in the worksheet.
  return (
    <span
      className="num w-full text-right text-[11px]"
      style={heatStyle(row.change_pct, { background: false })}
    >
      {row.change > 0 ? '+' : ''}
      {formatPrice(row.change, row.asset_class)}
    </span>
  )
}

export function NumericCell({
  value,
  decimals = 2,
  loaded = true,
  compact = false,
  row,
}: {
  value: number | null | undefined
  decimals?: number
  loaded?: boolean
  compact?: boolean
  row?: SecurityRow
}) {
  return (
    <span className="num w-full text-right text-[11px]">
      <Pending loaded={loaded} row={row}>
        {compact ? formatCompact(value) : formatNumber(value, decimals)}
      </Pending>
    </span>
  )
}

export function ReturnCell({
  value,
  loaded = true,
  row,
}: {
  value: number | null | undefined
  loaded?: boolean
  row?: SecurityRow
}) {
  return (
    <span className="num w-full text-right text-[11px]" style={{ color: directionColor(value) }}>
      <Pending loaded={loaded} row={row}>
        {formatPct(value)}
      </Pending>
    </span>
  )
}

export function VolumeCell({ row }: { row: SecurityRow }) {
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>VOLUME</TooltipTitle>
          <TooltipRow term="Session" value={formatVolume(row.volume)} />
          <TooltipRow term="20-day average" value={formatVolume(row.average_volume_20d)} />
          <TooltipRow term="Provider average" value={formatVolume(row.average_volume)} />
        </>
      }
    >
      <span className="num w-full text-right text-[11px]">{formatVolume(row.volume)}</span>
    </Tooltip>
  )
}

export function RelativeVolumeCell({ row }: { row: SecurityRow }) {
  const value = row.relative_volume
  const hot = isNum(value) && value >= 1.5
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>RELATIVE VOLUME</TooltipTitle>
          <div className="text-muted">
            Session volume divided by the average of the previous 20 sessions. The current session is
            excluded from that average, so an unusual print does not dilute its own reading. Above
            1.5x is highlighted.
          </div>
          <div className="mt-1.5">
            <TooltipRow term="Session volume" value={formatVolume(row.volume)} />
            <TooltipRow term="20-day average" value={formatVolume(row.average_volume_20d)} />
          </div>
        </>
      }
    >
      <span
        className="num w-full text-right text-[11px]"
        style={{ color: hot ? 'var(--orange-bright)' : 'var(--text)', fontWeight: hot ? 600 : 400 }}
      >
        <Pending loaded={row.technicals_loaded} row={row}>{isNum(value) ? `${value.toFixed(2)}x` : DASH}</Pending>
      </span>
    </Tooltip>
  )
}

export function RsiCell({ row }: { row: SecurityRow }) {
  const value = row.rsi14
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>RSI 14 · WILDER</TooltipTitle>
          <div className="text-muted">
            Relative Strength Index over 14 sessions, using Wilder's smoothing with a simple-mean
            seed. It measures the balance of recent gains and losses, not value.
          </div>
          <div className="mt-1.5 space-y-[1px]">
            <TooltipRow term="≤ 30 oversold" value={<span style={{ color: 'var(--positive)' }}>green</span>} />
            <TooltipRow term="30–45 soft" value={<span style={{ color: '#4bbd8e' }}>muted green</span>} />
            <TooltipRow term="45–55 neutral" value={<span style={{ color: 'var(--neutral)' }}>grey</span>} />
            <TooltipRow term="55–70 extended" value={<span style={{ color: 'var(--orange)' }}>orange</span>} />
            <TooltipRow term="≥ 70 overbought" value={<span style={{ color: 'var(--negative)' }}>red</span>} />
          </div>
          {row.rsi_zone && <div className="mt-1.5 label">CURRENT · {row.rsi_zone}</div>}
        </>
      }
    >
      <span
        className="num w-full text-right text-[11px]"
        style={{ color: rsiColor(value), fontWeight: isNum(value) && (value >= 70 || value <= 30) ? 600 : 400 }}
      >
        <Pending loaded={row.technicals_loaded} row={row}>{isNum(value) ? value.toFixed(1) : DASH}</Pending>
      </span>
    </Tooltip>
  )
}

export function MacdHistogramCell({ row }: { row: SecurityRow }) {
  const value = row.macd_histogram
  const arrow = row.macd_direction === 'RISING' ? '▲' : row.macd_direction === 'FALLING' ? '▼' : '■'
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>MACD 12 / 26 / 9</TooltipTitle>
          <div className="text-muted">
            MACD is EMA(12) − EMA(26); the signal line is a 9-period EMA of MACD; the histogram is
            their difference. The arrow shows whether the histogram rose or fell versus the previous
            session.
          </div>
          <div className="mt-1.5">
            <TooltipRow term="MACD" value={formatNumber(row.macd, 4)} />
            <TooltipRow term="Signal" value={formatNumber(row.macd_signal, 4)} />
            <TooltipRow term="Histogram" value={formatNumber(value, 4)} />
            <TooltipRow term="State" value={row.macd_state ?? DASH} />
            {row.macd_cross_up && <TooltipRow term="Event" value="Bullish cross" />}
            {row.macd_cross_down && <TooltipRow term="Event" value="Bearish cross" />}
          </div>
        </>
      }
    >
      <span
        className="num flex w-full items-center justify-end gap-1 text-[11px]"
        style={{ color: directionColor(value) }}
      >
        <Pending loaded={row.technicals_loaded} row={row}>
          <>
            <span className="text-[8px] opacity-80">{arrow}</span>
            {formatNumber(value, 3)}
          </>
        </Pending>
      </span>
    </Tooltip>
  )
}

export function MaStructureCell({ row }: { row: SecurityRow }) {
  const structure = row.ma_structure
  const color =
    structure === 'BULLISH'
      ? 'var(--positive)'
      : structure === 'BEARISH'
        ? 'var(--negative)'
        : 'var(--neutral)'
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>MA STRUCTURE</TooltipTitle>
          <div className="text-muted">
            BULLISH when price &gt; SMA50 &gt; SMA200. BEARISH when price &lt; SMA50 &lt; SMA200.
            Anything else is MIXED.
          </div>
          <div className="mt-1.5">
            <TooltipRow term="Price" value={formatPrice(row.last, row.asset_class)} />
            <TooltipRow term="SMA 50" value={formatPrice(row.sma50, row.asset_class)} />
            <TooltipRow term="SMA 200" value={formatPrice(row.sma200, row.asset_class)} />
            {row.ma_cross && (
              <TooltipRow
                term="Recent event"
                value={row.ma_cross === 'GOLDEN_CROSS' ? 'Golden cross' : 'Death cross'}
              />
            )}
          </div>
        </>
      }
    >
      <span className="flex w-full items-center gap-1 text-[10px] font-semibold" style={{ color }}>
        <Pending loaded={row.technicals_loaded} row={row}>
          <>
            {structure ?? DASH}
            {row.ma_cross && (
              <span
                className="border px-[3px] text-[8px]"
                style={{
                  color: row.ma_cross === 'GOLDEN_CROSS' ? 'var(--orange-bright)' : 'var(--negative)',
                  borderColor: 'currentColor',
                }}
              >
                {row.ma_cross === 'GOLDEN_CROSS' ? 'GC' : 'DC'}
              </span>
            )}
          </>
        </Pending>
      </span>
    </Tooltip>
  )
}

export function TrendCell({ row }: { row: SecurityRow }) {
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>TREND CLASSIFIER</TooltipTitle>
          <div className="text-muted">
            A rules-based description of the current moving-average configuration. STRONG UPTREND
            requires price &gt; SMA20 &gt; SMA50 &gt; SMA200 with a positive MACD histogram; STRONG
            DOWNTREND is the mirror image. It describes what price has already done and does not
            predict future returns.
          </div>
          <div className="mt-1.5">
            <TooltipRow term="Price" value={formatPrice(row.last, row.asset_class)} />
            <TooltipRow term="SMA 20" value={formatPrice(row.sma20, row.asset_class)} />
            <TooltipRow term="SMA 50" value={formatPrice(row.sma50, row.asset_class)} />
            <TooltipRow term="SMA 200" value={formatPrice(row.sma200, row.asset_class)} />
            <TooltipRow term="MACD hist" value={formatNumber(row.macd_histogram, 4)} />
          </div>
        </>
      }
    >
      <span
        className="truncate text-[10px] font-semibold"
        style={{ color: trendColor(row.trend) }}
      >
        <Pending loaded={row.technicals_loaded} row={row}>{row.trend ?? DASH}</Pending>
      </span>
    </Tooltip>
  )
}

export function SignalCell({ row }: { row: SecurityRow }) {
  const score = row.technical_score
  return (
    <Tooltip
      width={320}
      content={
        <>
          <TooltipTitle>TECHNICAL SIGNAL</TooltipTitle>
          {score ? (
            <>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12px] font-semibold" style={{ color: signalColor(score.signal) }}>
                  {score.signal}
                </span>
                <span className="num text-[11px] text-muted">
                  {score.score > 0 ? '+' : ''}
                  {score.score} / ±{score.max_score}
                </span>
              </div>
              <div className="space-y-[2px] border-t border-border pt-1.5">
                {score.components.map((component) => (
                  <div key={component.key} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-text">{component.label}</span>{' '}
                      <span className="text-muted">{component.detail}</span>
                    </span>
                    <span
                      className="num shrink-0"
                      style={{ color: directionColor(component.points) }}
                    >
                      {component.points > 0 ? '+' : ''}
                      {component.points}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 border-t border-border pt-1.5 text-[10px] text-muted">
                {score.disclaimer}
              </div>
            </>
          ) : (
            <div className="text-muted">
              Not enough history to score this security. Nothing is assumed in its place.
            </div>
          )}
        </>
      }
    >
      <span
        className="truncate text-[10px] font-semibold"
        style={{ color: signalColor(row.technical_signal) }}
      >
        <Pending loaded={row.technicals_loaded} row={row}>{row.technical_signal ?? DASH}</Pending>
      </span>
    </Tooltip>
  )
}

export function AtrCell({ row }: { row: SecurityRow }) {
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>ATR 14</TooltipTitle>
          <div className="text-muted">
            Average True Range over 14 sessions with Wilder's smoothing — the typical daily range in
            price terms, including gaps. Larger values mean wider daily swings.
          </div>
          <div className="mt-1.5">
            <TooltipRow term="ATR" value={formatPrice(row.atr14, row.asset_class)} />
            <TooltipRow
              term="As % of price"
              value={
                isNum(row.atr14) && isNum(row.last) ? `${((row.atr14 / row.last) * 100).toFixed(2)}%` : DASH
              }
            />
          </div>
        </>
      }
    >
      <span className="num w-full text-right text-[11px]">
        <Pending loaded={row.technicals_loaded} row={row}>{formatNumber(row.atr14, 2)}</Pending>
      </span>
    </Tooltip>
  )
}

export function VolatilityCell({ row }: { row: SecurityRow }) {
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>20-DAY VOLATILITY</TooltipTitle>
          <div className="text-muted">
            Standard deviation of the last 20 daily log returns, annualised by √252 and shown as a
            percentage. It measures realised movement, not expected movement.
          </div>
        </>
      }
    >
      <span className="num w-full text-right text-[11px]">
        <Pending loaded={row.technicals_loaded} row={row}>
          {isNum(row.volatility_20d) ? `${row.volatility_20d.toFixed(1)}%` : DASH}
        </Pending>
      </span>
    </Tooltip>
  )
}

export function SparklineCell({ row }: { row: SecurityRow }) {
  return (
    <span className="flex w-full items-center justify-center">
      <Pending loaded={row.technicals_loaded} row={row}>
        <Sparkline values={row.sparkline} changePct={row.sparkline_change_pct} />
      </Pending>
    </span>
  )
}

export function StatusCell({ row }: { row: SecurityRow }) {
  return <StatusPill status={row.status} message={row.status_message} compact />
}

export function UpdatedCell({ row }: { row: SecurityRow }) {
  return <span className="num w-full text-right text-[10px] text-muted">{formatTime(row.updated_at)}</span>
}
