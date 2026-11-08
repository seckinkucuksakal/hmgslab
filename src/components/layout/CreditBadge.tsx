import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CREDITS_CHANGED_EVENT, getMyCredits } from '../../lib/credits'
import { routes } from '../../lib/routes'

/** Remaining exam credits, always visible in the header; links to purchase. */
export function CreditBadge() {
  const { pathname } = useLocation()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getMyCredits()
        .then((credits) => {
          if (!cancelled) setBalance(credits.balance)
        })
        .catch(() => {
          // Keep the last known value; the badge is informational only.
        })
    }

    load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener(CREDITS_CHANGED_EVENT, load)
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.removeEventListener(CREDITS_CHANGED_EVENT, load)
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Reload on navigation too: enrolling or a completed purchase elsewhere
    // should show up without a full page refresh.
  }, [pathname])

  if (balance === null) return null

  return <CreditBadgeView balance={balance} />
}

export function CreditBadgeView({ balance }: { balance: number }) {
  const empty = balance < 1

  return (
    <Link
      to={routes.paketler}
      title={empty ? 'Deneme hakkınız kalmadı — hak satın al' : 'Deneme hakkı satın al'}
      aria-label={`${balance} deneme hakkı. Hak satın al`}
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm transition',
        empty
          ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
          : 'border-gray-200/70 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50',
      ].join(' ')}
    >
      {empty ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a1 1 0 0 1 1 1v3.5a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"
            clipRule="evenodd"
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
            strokeLinejoin="round"
            d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7Z"
          />
          <path strokeLinecap="round" strokeDasharray="1.5 2.5" d="M14 7v10" />
        </svg>
      )}
      <span className="tabular-nums">{balance}</span>
      <span className="hidden sm:inline">deneme hakkı</span>
    </Link>
  )
}
