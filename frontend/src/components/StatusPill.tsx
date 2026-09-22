import type { DataStatus } from '../api/types'
import { statusColor } from '../lib/heat'
import { Tooltip, TooltipTitle } from './Tooltip'

const EXPLANATIONS: Record<DataStatus, string> = {
  OK: 'Data returned normally by the provider.',
  DELAYED:
    'Yahoo Finance quotes are delayed - typically around 15 minutes for US equities, and longer on some venues.',
  STALE:
    'The last refresh failed, so the previous value is being shown. It is not current.',
  UNAVAILABLE:
    'The provider returned no data for this symbol. The row is kept so the security is not silently dropped.',
  DELISTED: 'This security appears to have stopped trading. Retained for reference only.',
  NO_HISTORY:
    'A price is available but there is not enough history to compute the technical columns.',
  ERROR: 'An unexpected error occurred while building this row.',
}

export function StatusPill({
  status,
  message,
  compact = false,
}: {
  status: DataStatus
  message?: string | null
  compact?: boolean
}) {
  const color = statusColor(status)
  return (
    <Tooltip
      content={
        <>
          <TooltipTitle>DATA STATUS · {status}</TooltipTitle>
          <div className="text-muted">{EXPLANATIONS[status]}</div>
          {message && <div className="mt-1.5 text-[10px] text-text/80">{message}</div>}
        </>
      }
    >
      <span
        className="inline-flex items-center gap-1 border px-1 text-[9px] font-semibold uppercase tracking-wider"
        style={{ color, borderColor: color, opacity: status === 'OK' ? 0.85 : 1 }}
      >
        <span className="inline-block h-1 w-1 rounded-full" style={{ background: color }} />
        {compact ? status.slice(0, 4) : status}
      </span>
    </Tooltip>
  )
}
