import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnOrderState,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight, ChevronsUpDown, EyeOff, Pin } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SecurityRow } from '../api/types'
import { ROW_HEIGHT, useSettings } from '../hooks/useSettings'
import { buildColumns, COLUMN_LABELS, DEFAULT_HIDDEN_COLUMNS } from './columns'
import { SkeletonRows } from './Skeleton'

const PINNED = ['name', 'ticker']
const GROUP_HEADER_HEIGHT = 24

interface MonitorTableProps {
  rows: SecurityRow[]
  groupOrder: string[]
  grouped: boolean
  isLoading: boolean
  selectedTicker: string | null
  onSelect: (ticker: string) => void
  onToggleFavourite: (ticker: string) => void
  ticks: Map<string, 'up' | 'down'>
  collapsedGroups: string[]
  onToggleGroup: (group: string) => void
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (next: VisibilityState) => void
  columnSizing: ColumnSizingState
  onColumnSizingChange: (next: ColumnSizingState) => void
  columnOrder: ColumnOrderState
  onColumnOrderChange: (next: ColumnOrderState) => void
}

type FlatItem =
  | { kind: 'group'; group: string; count: number; advancing: number; declining: number }
  | { kind: 'row'; row: SecurityRow; group: string }

export function MonitorTable(props: MonitorTableProps) {
  const {
    rows,
    groupOrder,
    grouped,
    isLoading,
    selectedTicker,
    onSelect,
    onToggleFavourite,
    ticks,
    collapsedGroups,
    onToggleGroup,
  } = props

  const { settings } = useSettings()
  const rowHeight = ROW_HEIGHT[settings.density]
  const containerRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [menuColumn, setMenuColumn] = useState<string | null>(null)

  const columns = useMemo(
    () =>
      buildColumns({
        onToggleFavourite,
        ticks,
        flashPrices: settings.flashPrices,
        showSparkline: settings.showSparkline,
      }),
    [onToggleFavourite, ticks, settings.flashPrices, settings.showSparkline],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility: { ...DEFAULT_HIDDEN_COLUMNS, ...props.columnVisibility },
      columnSizing: props.columnSizing,
      columnOrder: props.columnOrder,
      columnPinning: { left: PINNED },
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) =>
      props.onColumnVisibilityChange(
        typeof updater === 'function' ? updater(props.columnVisibility) : updater,
      ),
    onColumnSizingChange: (updater) =>
      props.onColumnSizingChange(
        typeof updater === 'function' ? updater(props.columnSizing) : updater,
      ),
    onColumnOrderChange: (updater) =>
      props.onColumnOrderChange(
        typeof updater === 'function' ? updater(props.columnOrder) : updater,
      ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnPinning: true,
    sortDescFirst: true,
    // Nulls always sort to the bottom: an unavailable security should never
    // masquerade as the biggest loser.
    sortingFns: {},
  })

  const sortedRows = table.getRowModel().rows

  /** Cells are rendered per section, so resolve the table row by ticker once. */
  const tableRowByTicker = useMemo(() => {
    const map = new Map<string, (typeof sortedRows)[number]>()
    for (const tableRow of sortedRows) map.set(tableRow.original.ticker, tableRow)
    return map
  }, [sortedRows])

  /** Flatten sorted rows into section headers + rows for the virtualizer. */
  const items = useMemo<FlatItem[]>(() => {
    if (!grouped) {
      return sortedRows.map((r) => ({ kind: 'row' as const, row: r.original, group: '' }))
    }
    const buckets = new Map<string, SecurityRow[]>()
    for (const tableRow of sortedRows) {
      const groups = tableRow.original.groups.length ? tableRow.original.groups : ['UNGROUPED']
      for (const group of groups) {
        const bucket = buckets.get(group)
        if (bucket) bucket.push(tableRow.original)
        else buckets.set(group, [tableRow.original])
      }
    }
    const ordered = [...buckets.keys()].sort((a, b) => {
      const ia = groupOrder.indexOf(a)
      const ib = groupOrder.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

    const out: FlatItem[] = []
    for (const group of ordered) {
      const groupRows = buckets.get(group)!
      out.push({
        kind: 'group',
        group,
        count: groupRows.length,
        advancing: groupRows.filter((r) => (r.change_pct ?? 0) > 0).length,
        declining: groupRows.filter((r) => (r.change_pct ?? 0) < 0).length,
      })
      if (!collapsedGroups.includes(group)) {
        for (const row of groupRows) out.push({ kind: 'row', row, group })
      }
    }
    return out
  }, [sortedRows, grouped, groupOrder, collapsedGroups])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (items[index].kind === 'group' ? GROUP_HEADER_HEIGHT : rowHeight),
    overscan: 14,
  })

  // Keyboard row navigation.
  const rowIndexByTicker = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((item, index) => {
      if (item.kind === 'row' && !map.has(item.row.ticker)) map.set(item.row.ticker, index)
    })
    return map
  }, [items])

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      const current = selectedTicker ? (rowIndexByTicker.get(selectedTicker) ?? -1) : -1
      let next = current + direction
      while (next >= 0 && next < items.length && items[next].kind !== 'row') next += direction
      if (next < 0 || next >= items.length) return
      const item = items[next]
      if (item.kind === 'row') {
        onSelect(item.row.ticker)
        virtualizer.scrollToIndex(next, { align: 'auto' })
      }
    },
    [items, onSelect, rowIndexByTicker, selectedTicker, virtualizer],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [moveSelection])

  useEffect(() => {
    const close = () => setMenuColumn(null)
    if (menuColumn) {
      window.addEventListener('click', close)
      return () => window.removeEventListener('click', close)
    }
    return undefined
  }, [menuColumn])

  const leafColumns = table.getVisibleLeafColumns()
  const totalWidth = leafColumns.reduce((sum, column) => sum + column.getSize(), 0)
  const pinnedWidth = leafColumns
    .filter((c) => PINNED.includes(c.id))
    .reduce((sum, column) => sum + column.getSize(), 0)

  const offsetFor = (columnId: string) => {
    let offset = 0
    for (const column of leafColumns) {
      if (column.id === columnId) break
      if (PINNED.includes(column.id)) offset += column.getSize()
    }
    return offset
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-hidden bg-bg">
        <SkeletonRows count={26} height={rowHeight} />
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg">
        <div className="text-center">
          <div className="label mb-1">NO MATCHING SECURITIES</div>
          <div className="text-[11px] text-muted">
            Adjust the filters, or clear the query to show the full worksheet.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-bg">
      <div style={{ width: totalWidth, minWidth: '100%' }}>
        {/* ---------------------------------------------------------- header */}
        <div
          className="sticky top-0 z-30 flex h-[26px] border-b border-border bg-panel"
          style={{ width: totalWidth, minWidth: '100%' }}
        >
          {table.getHeaderGroups()[0].headers.map((header) => {
            const isPinned = PINNED.includes(header.column.id)
            const align = (header.column.columnDef.meta as any)?.align ?? 'left'
            const sorted = header.column.getIsSorted()
            return (
              <div
                key={header.id}
                className="ws-header relative flex items-center border-r border-border/70"
                style={{
                  width: header.getSize(),
                  justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                  padding: '0 7px',
                  ...(isPinned
                    ? {
                        position: 'sticky',
                        left: offsetFor(header.column.id),
                        zIndex: 31,
                        background: 'var(--panel)',
                      }
                    : {}),
                }}
              >
                <button
                  className="flex min-w-0 items-center gap-1 truncate hover:text-orange-bright"
                  onClick={header.column.getToggleSortingHandler()}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setMenuColumn(menuColumn === header.column.id ? null : header.column.id)
                  }}
                  title={`${COLUMN_LABELS[header.column.id] ?? header.column.id} — click to sort, right-click for options`}
                >
                  <span className="truncate">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                  {sorted === 'asc' && <span className="text-[8px]">▲</span>}
                  {sorted === 'desc' && <span className="text-[8px]">▼</span>}
                  {!sorted && header.column.getCanSort() && (
                    <ChevronsUpDown size={8} className="opacity-25" />
                  )}
                  {isPinned && <Pin size={8} className="opacity-60" />}
                </button>

                {header.column.getCanResize() && (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`resizer ${header.column.getIsResizing() ? 'is-resizing' : ''}`}
                  />
                )}

                {menuColumn === header.column.id && (
                  <div
                    className="absolute top-[26px] z-50 w-[188px] border border-border bg-panel-secondary py-1 shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
                    style={{ left: align === 'right' ? undefined : 0, right: align === 'right' ? 0 : undefined }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MenuItem onClick={() => { header.column.toggleSorting(false); setMenuColumn(null) }}>
                      Sort ascending
                    </MenuItem>
                    <MenuItem onClick={() => { header.column.toggleSorting(true); setMenuColumn(null) }}>
                      Sort descending
                    </MenuItem>
                    <MenuItem onClick={() => { header.column.clearSorting(); setMenuColumn(null) }}>
                      Clear sort
                    </MenuItem>
                    <div className="my-1 border-t border-border" />
                    <MenuItem onClick={() => moveColumn(table, header.column.id, -1, props)}>
                      Move left
                    </MenuItem>
                    <MenuItem onClick={() => moveColumn(table, header.column.id, 1, props)}>
                      Move right
                    </MenuItem>
                    {header.column.getCanHide() && (
                      <>
                        <div className="my-1 border-t border-border" />
                        <MenuItem
                          onClick={() => {
                            header.column.toggleVisibility(false)
                            setMenuColumn(null)
                          }}
                        >
                          <EyeOff size={10} /> Hide column
                        </MenuItem>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ------------------------------------------------------------ body */}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]

            if (item.kind === 'group') {
              const collapsed = collapsedGroups.includes(item.group)
              return (
                <div
                  key={`group-${item.group}`}
                  className="absolute left-0 flex items-center border-y border-border bg-panel-secondary"
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
                    width: Math.max(totalWidth, 900),
                    minWidth: '100%',
                  }}
                >
                  <button
                    onClick={() => onToggleGroup(item.group)}
                    className="sticky left-0 z-20 flex h-full items-center gap-1.5 bg-panel-secondary pl-2 pr-3"
                    style={{ minWidth: pinnedWidth }}
                  >
                    {collapsed ? (
                      <ChevronRight size={11} className="text-orange" />
                    ) : (
                      <ChevronDown size={11} className="text-orange" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-orange">
                      {item.group}
                    </span>
                    <span className="num text-[10px] text-muted">({item.count})</span>
                  </button>
                  <div className="flex items-center gap-2 pl-2 text-[10px]">
                    <span className="num" style={{ color: 'var(--positive)' }}>
                      ▲ {item.advancing}
                    </span>
                    <span className="num" style={{ color: 'var(--negative)' }}>
                      ▼ {item.declining}
                    </span>
                  </div>
                </div>
              )
            }

            const row = item.row
            const isSelected = row.ticker === selectedTicker
            const dimmed = row.last === null

            return (
              <div
                key={`${item.group}-${row.ticker}`}
                data-selected={isSelected}
                onClick={() => onSelect(row.ticker)}
                className="ws-row absolute left-0 flex cursor-pointer border-b border-border/35"
                style={{
                  top: virtualRow.start,
                  height: virtualRow.size,
                  width: totalWidth,
                  minWidth: '100%',
                  background: virtualRow.index % 2 ? 'rgba(255,255,255,0.012)' : 'transparent',
                  opacity: dimmed ? 0.55 : 1,
                }}
              >
                {tableRowByTicker
                  .get(row.ticker)
                  ?.getVisibleCells()
                  .map((cell) => {
                    const isPinned = PINNED.includes(cell.column.id)
                    const align = (cell.column.columnDef.meta as any)?.align ?? 'left'
                    return (
                      <div
                        key={cell.id}
                        className="ws-cell border-r border-border/25"
                        style={{
                          width: cell.column.getSize(),
                          justifyContent:
                            align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                          ...(isPinned
                            ? {
                                position: 'sticky',
                                left: offsetFor(cell.column.id),
                                zIndex: 10,
                                background: isSelected ? '#182231' : 'var(--bg)',
                              }
                            : {}),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left text-[11px] text-text hover:bg-panel hover:text-orange"
    >
      {children}
    </button>
  )
}

function moveColumn(
  table: ReturnType<typeof useReactTable<SecurityRow>>,
  columnId: string,
  direction: -1 | 1,
  props: MonitorTableProps,
) {
  const current = table.getState().columnOrder.length
    ? [...table.getState().columnOrder]
    : table.getAllLeafColumns().map((c) => c.id)
  const index = current.indexOf(columnId)
  const target = index + direction
  if (index === -1 || target < 0 || target >= current.length) return
  ;[current[index], current[target]] = [current[target], current[index]]
  props.onColumnOrderChange(current)
}
