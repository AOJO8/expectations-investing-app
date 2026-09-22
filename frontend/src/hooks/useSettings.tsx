import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocalStorage } from './useLocalStorage'

export type RefreshInterval = 0 | 30 | 60 | 300
export type Density = 'compact' | 'standard'
export type ViewId = 'monitor' | 'charts' | 'heatmap' | 'technicals'

export interface Settings {
  refreshInterval: RefreshInterval
  density: Density
  flashPrices: boolean
  showSparkline: boolean
  defaultView: ViewId
}

export const DEFAULT_SETTINGS: Settings = {
  refreshInterval: 60,
  density: 'compact',
  flashPrices: true,
  showSparkline: true,
  defaultView: 'monitor',
}

interface SettingsContextValue {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings, reset] = useLocalStorage<Settings>('ayo.settings', DEFAULT_SETTINGS)

  const value = useMemo<SettingsContextValue>(
    () => ({
      // Merge so a newly added setting picks up its default.
      settings: { ...DEFAULT_SETTINGS, ...settings },
      update: (key, next) => setSettings((prev) => ({ ...prev, [key]: next })),
      reset,
    }),
    [settings, setSettings, reset],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}

export const ROW_HEIGHT: Record<Density, number> = { compact: 22, standard: 28 }
