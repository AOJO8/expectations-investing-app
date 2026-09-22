interface SparklineProps {
  values: number[] | null | undefined
  width?: number
  height?: number
  changePct?: number | null
}

/** Axis-free 30-session trace. Pure SVG, no chart library, no tooltips. */
export function Sparkline({ values, width = 68, height = 16, changePct }: SparklineProps) {
  if (!values || values.length < 2) {
    return <span className="text-muted text-[10px]">—</span>
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)

  const points = values
    .map((value, index) => {
      const x = index * step
      const y = height - 1 - ((value - min) / span) * (height - 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const direction = changePct ?? values[values.length - 1] - values[0]
  const stroke = direction >= 0 ? 'var(--positive)' : 'var(--negative)'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
