import { useServerClock } from '../../hooks/useServerClock'
import { SITE_NAME } from '../../lib/brand'

export function NavbarClock() {
  const { formattedDate, formattedTime } = useServerClock()

  return (
    <div
      className="hidden shrink-0 border-l border-gray-200 pl-3 text-right md:block"
      aria-label={`${SITE_NAME} sunucu saati`}
    >
      <p className="whitespace-nowrap text-sm tabular-nums text-gray-700">
        {formattedDate}
        <span className="mx-1.5 text-gray-300">·</span>
        {formattedTime}
      </p>
    </div>
  )
}

function getInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'K'
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR')
}

export function NavbarUserButton({
  displayName,
  menuOpen,
  onClick,
}: {
  displayName: string
  menuOpen: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-[10rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 sm:max-w-[11rem]"
      aria-expanded={menuOpen}
      aria-haspopup="menu"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-200 text-[11px] font-medium text-gray-700">
        {getInitial(displayName)}
      </span>
      <span className="truncate">{displayName}</span>
    </button>
  )
}
