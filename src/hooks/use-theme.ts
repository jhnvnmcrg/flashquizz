import { useCallback, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'fq-theme'

/** Inline script (runs before paint) — keep in sync with applyTheme(). */
export const themeScript = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`

const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystem = () => {
    if (readPreference() === 'system') applyTheme('system')
    callback()
  }
  media.addEventListener('change', onSystem)
  return () => {
    listeners.delete(callback)
    media.removeEventListener('change', onSystem)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readPreference, () => 'system' as const)
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light' as const,
  )
  const setTheme = useCallback((pref: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref)
    } catch {
      // storage unavailable (private mode) — still apply for this page
    }
    applyTheme(pref)
    for (const l of listeners) l()
  }, [])
  return { theme, resolvedTheme, setTheme }
}
