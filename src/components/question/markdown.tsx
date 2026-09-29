import { Streamdown } from 'streamdown'

import { cn } from '#/lib/utils'

/** Sanitised Markdown (GFM tables, lists) for stems and rationales. */
export function Markdown({
  children,
  className,
  inline = false,
}: {
  children: string
  className?: string
  inline?: boolean
}) {
  if (!children.trim()) return null
  return (
    <Streamdown
      mode="static"
      controls={false}
      className={cn(
        'prose prose-fq max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-table:my-3 prose-th:px-2 prose-td:px-2',
        inline && 'prose-p:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
    >
      {children}
    </Streamdown>
  )
}
