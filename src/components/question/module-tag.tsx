import type { CSSProperties, ReactNode } from 'react'

import { cn } from '#/lib/utils'

export function moduleStyle(hue: number) {
  return { '--module-hue': hue } as CSSProperties
}

/** Small colour-coded module pill, like an auxiliary label tab. */
export function ModuleTag({
  code,
  hue,
  children,
  className,
}: {
  code: string
  hue: number
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      data-module
      style={moduleStyle(hue)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-module-soft px-2.5 py-0.5 text-xs font-semibold text-module-foreground',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-module" />
      {code}
      {children}
    </span>
  )
}
