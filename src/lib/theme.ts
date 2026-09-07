export const THEME_STORAGE_KEY = 'hmgSlab-theme'

export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'dark' || stored === 'light' ? stored : null
}

export function getPreferredTheme(): Theme {
  return getStoredTheme() ?? 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}
