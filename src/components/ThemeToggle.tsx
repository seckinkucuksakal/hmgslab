import { useTheme } from '../hooks/useTheme'

type ThemeToggleProps = {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        'inline-flex items-center justify-center rounded-full border border-gray-200/70 bg-white text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50',
        compact ? 'h-9 w-9' : 'h-9 gap-2 px-3 text-sm',
        className,
      ].join(' ')}
      aria-label={isDark ? 'Açık moda geç' : 'Gece moduna geç'}
      title={isDark ? 'Açık mod' : 'Gece modu'}
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-4 w-4"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
          />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="h-4 w-4"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"
          />
        </svg>
      )}
      {!compact && <span>{isDark ? 'Açık mod' : 'Gece modu'}</span>}
    </button>
  )
}
