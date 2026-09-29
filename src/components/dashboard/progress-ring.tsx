/** Coverage ring (seen ÷ total) with a caption for screen readers. */
export function ProgressRing({ value, total, size = 44 }: { value: number; total: number; size?: number }) {
  const pct = total ? value / total : 0
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% seen`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" className="stroke-module-line" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap={pct > 0 ? 'round' : 'butt'}
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="stroke-module transition-[stroke-dasharray] duration-700"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-[11px] font-bold tabular-nums"
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  )
}
