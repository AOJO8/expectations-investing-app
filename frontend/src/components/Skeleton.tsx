export function SkeletonCell({ width = '70%' }: { width?: string }) {
  return <span className="skeleton inline-block h-[9px]" style={{ width }} />
}

export function SkeletonRows({ count = 12, height = 22 }: { count?: number; height?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border/40 px-2"
          style={{ height }}
        >
          <SkeletonCell width="120px" />
          <SkeletonCell width="52px" />
          <SkeletonCell width="70px" />
          <SkeletonCell width="60px" />
          <SkeletonCell width="90px" />
          <SkeletonCell width="70px" />
          <SkeletonCell width="110px" />
        </div>
      ))}
    </div>
  )
}
