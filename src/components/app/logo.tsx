import { cn } from '#/lib/utils'

/** Two-tone capsule mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 -rotate-45">
        <rect x="3" y="10" width="26" height="12" rx="6" className="fill-card stroke-foreground" strokeWidth="2" />
        <path d="M16 10h7a6 6 0 0 1 0 12h-7z" className="fill-primary" />
        <path d="M16 10v12" className="stroke-foreground" strokeWidth="2" />
      </svg>
      <span className="text-lg">FlashQuizz</span>
    </span>
  )
}
