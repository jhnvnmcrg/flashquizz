import { useEffect, useRef, useState } from 'react'

/**
 * Milliseconds left until `expiresAt`, corrected for client clock drift using
 * the server's clock at load time. Uses absolute time so it stays right after
 * background tabs / sleep. Calls `onExpire` once.
 */
export function useCountdown(expiresAt: Date, serverNow: Date, onExpire?: () => void) {
  const offset = useRef(new Date(serverNow).getTime() - Date.now())
  const expire = useRef(onExpire)
  expire.current = onExpire
  const fired = useRef(false)
  const compute = () => Math.max(0, new Date(expiresAt).getTime() - (Date.now() + offset.current))
  const [left, setLeft] = useState(compute)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `compute` reads refs + expiresAt only
  useEffect(() => {
    const tick = () => {
      const ms = compute()
      setLeft(ms)
      if (ms <= 0 && !fired.current) {
        fired.current = true
        expire.current?.()
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [expiresAt])

  return left
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
