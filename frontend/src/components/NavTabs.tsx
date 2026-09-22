import { BarChart3, Grid3x3, LineChart, Table2 } from 'lucide-react'
import type { ViewId } from '../hooks/useSettings'

const TABS: { id: ViewId; label: string; icon: typeof Table2 }[] = [
  { id: 'monitor', label: 'MONITOR', icon: Table2 },
  { id: 'charts', label: 'CHARTS', icon: LineChart },
  { id: 'heatmap', label: 'HEATMAP', icon: Grid3x3 },
  { id: 'technicals', label: 'TECHNICALS', icon: BarChart3 },
]

export function NavTabs({
  active,
  onChange,
  right,
}: {
  active: ViewId
  onChange: (view: ViewId) => void
  right?: React.ReactNode
}) {
  return (
    <nav className="flex h-[30px] shrink-0 items-stretch border-b border-border bg-bg">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-1.5 border-r border-border px-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors"
            style={{
              color: isActive ? 'var(--orange)' : 'var(--muted)',
              background: isActive ? 'var(--panel-secondary)' : 'transparent',
              boxShadow: isActive ? 'inset 0 -2px 0 var(--orange)' : undefined,
            }}
          >
            <Icon size={11} />
            {tab.label}
          </button>
        )
      })}
      <div className="ml-auto flex items-center pr-2">{right}</div>
    </nav>
  )
}
