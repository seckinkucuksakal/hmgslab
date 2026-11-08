import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { formatTry, getCreditPackages, getMyCredits, type CreditPackage } from '../lib/credits'
import { routes } from '../lib/routes'

const DISMISS_KEY_PREFIX = 'hmgs:out-of-credits-prompt:'

function wasShown(userId: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

function markShown(userId: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + userId, '1')
  } catch {
    // Storage blocked: the prompt may show again on the next load, which is fine.
  }
}

type OutOfCreditsDialogProps = {
  packages: CreditPackage[]
  onBuy: () => void
  onClose: () => void
}

/** The offer itself; rendered by OutOfCreditsPrompt, kept separate so it can be previewed. */
export function OutOfCreditsDialog({ packages, onBuy, onClose }: OutOfCreditsDialogProps) {
  const buyRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    buyRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const single = packages.find((p) => p.credits === 1)
  const best = packages.reduce<CreditPackage | null>(
    (acc, p) => (!acc || p.price_kurus / p.credits < acc.price_kurus / acc.credits ? p : acc),
    null,
  )
  const bestSaving =
    best && single && best.credits > 1 ? single.price_kurus * best.credits - best.price_kurus : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="out-of-credits-title"
      aria-describedby="out-of-credits-text"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-sm font-medium text-blue-100">Deneme hakkın kalmadı</p>
          <h2 id="out-of-credits-title" className="mt-1 text-xl font-semibold">
            Hazırlığa kaldığın yerden devam et
          </h2>
        </div>

        <div className="px-6 py-5">
          <p id="out-of-credits-text" className="text-sm text-gray-600 dark:text-slate-400">
            Yeni denemelere ve canlı sınavlara katılmak için deneme hakkı al. Haklar
            süresizdir, istediğin zaman kullanırsın.
          </p>

          {best && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {best.credits} deneme hakkı
                </p>
                <p className="text-xs text-gray-600 dark:text-slate-400">
                  Deneme başı {formatTry(Math.round(best.price_kurus / best.credits))}
                  {bestSaving > 0 && (
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      {' '}
                      · {formatTry(bestSaving)} kazanç
                    </span>
                  )}
                </p>
              </div>
              <p className="whitespace-nowrap text-lg font-semibold text-gray-900 tabular-nums dark:text-slate-100">
                {formatTry(best.price_kurus)}
              </p>
            </div>
          )}

          {single && single.id !== best?.id && (
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Tek deneme de alabilirsin: {formatTry(single.price_kurus)}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Daha sonra
            </button>
            <button
              ref={buyRef}
              type="button"
              onClick={onBuy}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Paketleri gör →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Once per signed-in browser session: if the user has no exam credits left,
 * offer the packages. Not shown on the purchase page itself.
 */
export function OutOfCreditsPrompt() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [packages, setPackages] = useState<CreditPackage[] | null>(null)

  const userId = user?.id ?? null
  const onPurchasePage = pathname === routes.paketler

  // Signing out ends the "session": the next sign-in may show the offer again.
  useEffect(() => {
    if (userId) return
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(DISMISS_KEY_PREFIX)) sessionStorage.removeItem(key)
      }
    } catch {
      // ignore
    }
  }, [userId])

  useEffect(() => {
    if (!userId || onPurchasePage || wasShown(userId)) return

    let cancelled = false
    Promise.all([getMyCredits(), getCreditPackages()])
      .then(([credits, pkgs]) => {
        if (cancelled || wasShown(userId)) return
        markShown(userId)
        if (credits.balance < 1) setPackages(pkgs)
      })
      .catch(() => {
        // Informational only; try again on the next navigation.
      })

    return () => {
      cancelled = true
    }
  }, [userId, onPurchasePage])

  if (!packages || onPurchasePage) return null

  return (
    <OutOfCreditsDialog
      packages={packages}
      onClose={() => setPackages(null)}
      onBuy={() => {
        setPackages(null)
        navigate(routes.paketler)
      }}
    />
  )
}
