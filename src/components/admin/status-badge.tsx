import { STATUS_LABELS, type QuestionStatus } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'

const STYLES: Record<QuestionStatus, string> = {
  auto: 'bg-secondary text-secondary-foreground',
  verified: 'bg-success-soft text-success',
  needs_review: 'bg-warning-soft text-warning-foreground',
  archived: 'bg-muted text-muted-foreground line-through',
}

export function StatusBadge({ status, className }: { status: QuestionStatus; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  )
}
