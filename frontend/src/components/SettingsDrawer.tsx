import { RotateCcw, X } from 'lucide-react'
import type { VisibilityState } from '@tanstack/react-table'
import { COLUMN_LABELS, DEFAULT_HIDDEN_COLUMNS } from './columns'
import { useSettings, type Density, type RefreshInterval, type ViewId } from '../hooks/useSettings'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (next: VisibilityState) => void
  onResetLayout: () => void
  provider: string | undefined
  isSynthetic: boolean
}

const PINNED = new Set(['name', 'ticker'])

export function SettingsDrawer({
  open,
  onClose,
  columnVisibility,
  onColumnVisibilityChange,
  onResetLayout,
  provider,
  isSynthetic,
}: SettingsDrawerProps) {
  const { settings, update } = useSettings()
  if (!open) return null

  const merged = { ...DEFAULT_HIDDEN_COLUMNS, ...columnVisibility }
  const columnIds = Object.keys(COLUMN_LABELS)

  return (
    <div className="fixed inset-0 z-[140] flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-[330px] flex-col border-l border-border bg-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-border px-3">
          <span className="label">SETTINGS</span>
          <button onClick={onClose} className="text-muted hover:text-orange">
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="DATA">
            <Row label="Provider">
              <span className="num text-[11px]">{provider ?? '—'}</span>
            </Row>
            {isSynthetic && (
              <div className="mt-1 border border-negative px-2 py-1 text-[10px]" style={{ color: 'var(--negative)' }}>
                Synthetic fixture data is active. Values on screen are not market prices.
              </div>
            )}
          </Section>

          <Section title="REFRESH INTERVAL">
            <div className="flex gap-1">
              {([0, 30, 60, 300] as RefreshInterval[]).map((value) => (
                <Choice
                  key={value}
                  active={settings.refreshInterval === value}
                  onClick={() => update('refreshInterval', value)}
                >
                  {value === 0 ? 'OFF' : value === 30 ? '30 SEC' : value === 60 ? '1 MIN' : '5 MIN'}
                </Choice>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted">
              Refreshing keeps sorting, filters, collapsed sections, selection and scroll position.
            </p>
          </Section>

          <Section title="DENSITY">
            <div className="flex gap-1">
              {(['compact', 'standard'] as Density[]).map((value) => (
                <Choice key={value} active={settings.density === value} onClick={() => update('density', value)}>
                  {value.toUpperCase()}
                </Choice>
              ))}
            </div>
          </Section>

          <Section title="DEFAULT VIEW">
            <div className="flex flex-wrap gap-1">
              {(['monitor', 'charts', 'heatmap', 'technicals'] as ViewId[]).map((value) => (
                <Choice
                  key={value}
                  active={settings.defaultView === value}
                  onClick={() => update('defaultView', value)}
                >
                  {value.toUpperCase()}
                </Choice>
              ))}
            </div>
          </Section>

          <Section title="BEHAVIOUR">
            <Toggle
              label="Flash changing prices"
              checked={settings.flashPrices}
              onChange={(value) => update('flashPrices', value)}
            />
            <Toggle
              label="Show 30D sparkline"
              checked={settings.showSparkline}
              onChange={(value) => update('showSparkline', value)}
            />
          </Section>

          <Section title="VISIBLE COLUMNS">
            <div className="grid grid-cols-2 gap-x-2">
              {columnIds.map((id) => {
                const pinned = PINNED.has(id)
                const visible = pinned || merged[id] !== false
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-1.5 py-[2px] text-[10px]"
                    style={{ opacity: pinned ? 0.55 : 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={pinned}
                      onChange={(event) =>
                        onColumnVisibilityChange({ ...columnVisibility, [id]: event.target.checked })
                      }
                      className="h-[11px] w-[11px] accent-[#ff9f1c]"
                    />
                    <span className="truncate">{COLUMN_LABELS[id]}</span>
                  </label>
                )
              })}
            </div>
          </Section>

          <Section title="LAYOUT">
            <button
              onClick={onResetLayout}
              className="flex items-center gap-1.5 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted hover:border-orange hover:text-orange"
            >
              <RotateCcw size={10} /> Reset layout
            </button>
            <p className="mt-1.5 text-[10px] text-muted">
              Clears column widths, order, visibility, density and collapsed sections stored in this
              browser. Watchlists and favourites are kept on the server.
            </p>
          </Section>
        </div>

        <div className="shrink-0 border-t border-border px-3 py-2 text-[9px] leading-[13px] text-muted">
          Market data via Yahoo Finance and delayed. Technical labels are rules-based descriptions of
          past prices, not investment advice.
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-2.5">
      <div className="label mb-1.5">{title}</div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-[2px] text-[11px]">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="border px-2 py-[3px] text-[10px] font-semibold tracking-wider"
      style={{
        borderColor: active ? 'var(--orange)' : 'var(--border)',
        background: active ? 'rgba(255,159,28,0.14)' : 'transparent',
        color: active ? 'var(--orange)' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-[3px] text-[11px]">
      <span className="text-muted">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-[12px] w-[12px] accent-[#ff9f1c]"
      />
    </label>
  )
}
