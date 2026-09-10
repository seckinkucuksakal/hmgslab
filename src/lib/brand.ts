/** Public site / product name shown in UI. */
export const SITE_NAME = 'HMGSlab'

/** Bust browser favicon cache after asset updates. */
export const FAVICON_VERSION = '3'

export const FAVICON_PATHS = {
  light: {
    png96: '/favicon-96x96.png',
    ico: '/favicon.ico',
    apple: '/apple-touch-icon.png',
    manifest: '/site.webmanifest',
  },
  dark: {
    png96: '/favicon-dark-96x96.png',
    ico: '/favicon-dark.ico',
    apple: '/apple-touch-icon-dark.png',
    manifest: '/site-dark.webmanifest',
  },
} as const

export type FaviconTheme = keyof typeof FAVICON_PATHS

export function faviconUrl(path: string): string {
  return `${path}?v=${FAVICON_VERSION}`
}

export function getFaviconSet(theme: FaviconTheme) {
  const paths = FAVICON_PATHS[theme]
  return {
    png96: faviconUrl(paths.png96),
    ico: faviconUrl(paths.ico),
    apple: faviconUrl(paths.apple),
    manifest: faviconUrl(paths.manifest),
  }
}
