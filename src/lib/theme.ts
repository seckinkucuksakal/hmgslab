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

const FAVICON_PATHS = {
  light: {
    png96: '/favicon-96x96.png',
    svg: '/favicon.svg',
    ico: '/favicon.ico',
    apple: '/apple-touch-icon.png',
    manifest: '/site.webmanifest',
  },
  dark: {
    png96: '/favicon-dark-96x96.png',
    svg: '/favicon-dark.svg',
    ico: '/favicon-dark.ico',
    apple: '/apple-touch-icon-dark.png',
    manifest: '/site-dark.webmanifest',
  },
} as const

export function applyFavicon(theme: Theme) {
  if (typeof document === 'undefined') return

  const icons = FAVICON_PATHS[theme]

  document.getElementById('favicon-96')?.setAttribute('href', icons.png96)
  document.getElementById('favicon-svg')?.setAttribute('href', icons.svg)
  document.getElementById('favicon-ico')?.setAttribute('href', icons.ico)
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
