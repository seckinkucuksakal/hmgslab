import { getFaviconSet, type FaviconTheme } from './brand'

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

export function applyFavicon(theme: Theme) {
  if (typeof document === 'undefined') return

  const icons = getFaviconSet(theme as FaviconTheme)

  document.getElementById('favicon-ico')?.setAttribute('href', icons.ico)
  document.getElementById('favicon-96')?.setAttribute('href', icons.png96)
  document.getElementById('apple-touch-icon')?.setAttribute('href', icons.apple)
  document.getElementById('site-manifest')?.setAttribute('href', icons.manifest)
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  applyFavicon(theme)
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyTheme(theme)
}
