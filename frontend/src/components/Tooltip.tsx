import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  align?: 'left' | 'center' | 'right'
  width?: number
  /** Render the anchor as a full-width block (for layout children, not inline text). */
  block?: boolean
  /** Extra classes on the anchor - e.g. shrink-0 so a chip is not compressed. */
  anchorClassName?: string
}

/**
 * Lightweight hover tooltip rendered in-flow with fixed positioning, so it is
 * never clipped by the table's overflow container.
 */
export function Tooltip({
  content,
  children,
  align = 'center',
  width = 280,
  block = false,
  anchorClassName = '',
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const anchor = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    const offset = align === 'left' ? 0 : align === 'right' ? width - rect.width : (width - rect.width) / 2
    const left = Math.min(
      Math.max(8, rect.left - offset),
      Math.max(8, window.innerWidth - width - 8),
    )
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > 190 ? rect.bottom + 6 : rect.top - 6
    setCoords({ top, left })
  }, [open, align, width])

  return (
    <>
      <span
        ref={anchor}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`${block ? 'flex w-full items-center' : 'inline-flex min-w-0 max-w-full items-center'} ${anchorClassName}`}
      >
        {children}
      </span>
      {open && (
        <div
          role="tooltip"
          className="fixed z-[200] border border-border bg-[#111820] px-2.5 py-2 text-[11px] leading-[15px] text-text shadow-[0_8px_24px_rgba(0,0,0,0.6)] pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            width,
            transform: window.innerHeight - coords.top < 190 ? 'translateY(-100%)' : undefined,
          }}
        >
          {content}
        </div>
      )}
    </>
  )
}

export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="label mb-1">{children}</div>
}

export function TooltipRow({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-[1px]">
      <span className="text-muted">{term}</span>
      <span className="num text-right">{value}</span>
    </div>
  )
}
