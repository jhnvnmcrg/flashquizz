import { useEffect, useRef } from 'react'

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Keys are matched against `event.key` (case-insensitive for letters), e.g.
 * { a: pickA, '1': pickA, ' ': flip, Enter: next, ArrowRight: next, '?': help }.
 * Ignored while typing in a field or when a modifier is held.
 */
export function useKeyboardShortcuts(map: ShortcutMap, enabled = true) {
  const ref = useRef(map)
  ref.current = map

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const handler = ref.current[key] ?? ref.current[event.key]
      if (handler) {
        event.preventDefault()
        handler(event)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** 1–5 and a–e map to choice keys A–E. */
export function choiceShortcut(key: string): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  const index = '12345'.indexOf(key) >= 0 ? '12345'.indexOf(key) : 'abcde'.indexOf(key.toLowerCase())
  return index >= 0 ? (['A', 'B', 'C', 'D', 'E'] as const)[index] : null
}
