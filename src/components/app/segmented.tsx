import { cn } from '#/lib/utils'

/** Compact single-choice control (radio semantics). */
export function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string }[]
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-secondary p-1', className)}>
      {options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: card-style option; ARIA radio semantics + keyboard shortcuts
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm"
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
