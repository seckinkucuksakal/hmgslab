import { getFaviconSet, type FaviconTheme } from '../lib/brand'
import { useTheme } from '../hooks/useTheme'

type SiteLogoProps = {
  size?: number
  className?: string
}

export function SiteLogo({ size = 32, className = '' }: SiteLogoProps) {
  const { isDark } = useTheme()
  const theme: FaviconTheme = isDark ? 'dark' : 'light'
  const src = getFaviconSet(theme).png96

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`rounded-xl object-contain shadow-sm ${className}`}
      aria-hidden
    />
  )
}
