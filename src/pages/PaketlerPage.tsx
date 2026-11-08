import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  formatTry,
  getCreditPackages,
  getMyCreditOrders,
  getMyCredits,
  type CreditOrder,
  type CreditPackage,
} from '../lib/credits'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import { routes } from '../lib/routes'

/**
 * Package selection is client-side only. An order is created when the user
 * actually starts paying (createCreditOrder in lib/credits), so browsing or
 * changing your mind never leaves pending/cancelled orders behind.
 *
 * Payment provider goes here: handleCheckout should call createCreditOrder()
 * and hand the order id to the provider's checkout; the provider's webhook
 * then fulfils the order on the server (private.fulfill_credit_order).
 */
const PAYMENTS_ENABLED = false

const perks = ['Haklar süresizdir', '1 kayıt = 1 hak', 'Katılmadığın canlı sınavda hak iadesi']

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

type PackagePickerProps = {
  packages: CreditPackage[]
  balance: number | null
  paidOrders: CreditOrder[]
}

/** Sized to fit one laptop screen (header, packages and checkout) without scrolling. */
export function PackagePicker({ packages, balance, paidOrders }: PackagePickerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkoutNotice, setCheckoutNotice] = useState(false)

  const singlePrice = packages.find((p) => p.credits === 1)?.price_kurus ?? null

  // The best value per credit is highlighted and preselected.
  const bestValueId = useMemo(() => {
    if (packages.length < 2) return null
    return packages.reduce((best, p) =>
      p.price_kurus / p.credits < best.price_kurus / best.credits ? p : best,
    ).id
  }, [packages])

  const selected =
    packages.find((p) => p.id === selectedId) ??
    packages.find((p) => p.id === bestValueId) ??
    packages[0] ??
    null

  const handleCheckout = () => {
    if (!PAYMENTS_ENABLED) {
      setCheckoutNotice(true)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">
            Deneme hakkı al
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Paketini seç, dilediğin denemeye kaydol. Çok alana deneme başı daha
            avantajlı.
          </p>
        </div>
        {balance !== null && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Mevcut hakkın:
            <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {balance}
            </span>
          </p>
        )}
      </header>

      <fieldset className="mt-6">
        <legend className="sr-only">Paket seçimi</legend>
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
          {packages.map((pkg) => {
            const isSelected = selected?.id === pkg.id
            const isBest = pkg.id === bestValueId
            const perCredit = Math.round(pkg.price_kurus / pkg.credits)
            const saving =
              singlePrice !== null && pkg.credits > 1
                ? singlePrice * pkg.credits - pkg.price_kurus
                : 0

            return (
              <label
                key={pkg.id}
                className={[
                  'relative flex cursor-pointer items-center gap-4 rounded-2xl border bg-white px-4 py-3 transition-all duration-200 md:flex-col md:items-stretch md:gap-0 md:p-5 dark:bg-slate-900',
                  // keyboard focus only; a mouse click must not add a second ring
                  'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-blue-500 has-[input:focus-visible]:ring-offset-2 dark:has-[input:focus-visible]:ring-offset-slate-950',
                  isSelected
                    ? 'border-blue-600 shadow-lg shadow-blue-600/10 ring-1 ring-blue-600 dark:border-blue-500 dark:ring-blue-500'
                    : 'border-gray-200 shadow-sm hover:border-gray-300 hover:shadow-md dark:border-slate-800 dark:hover:border-slate-700',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="package"
                  value={pkg.id}
                  checked={isSelected}
                  onChange={() => {
                    setSelectedId(pkg.id)
                    setCheckoutNotice(false)
                  }}
                  className="sr-only"
                />

                {isBest && (
                  <span className="absolute -top-2.5 right-4 whitespace-nowrap rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm md:left-1/2 md:right-auto md:-translate-x-1/2">
                    En avantajlı
                  </span>
                )}

                <span
                  aria-hidden
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition md:order-first md:self-end',
                    isSelected
                      ? 'bg-blue-600 text-white dark:bg-blue-500'
                      : 'border-2 border-gray-300 dark:border-slate-600',
                  ].join(' ')}
                >
                  {isSelected && <CheckIcon className="h-3 w-3" />}
                </span>

                <p className="flex flex-1 items-baseline gap-1.5 md:-mt-3 md:flex-none">
                  <span className="text-3xl font-semibold tracking-tight text-gray-900 tabular-nums md:text-4xl dark:text-slate-100">
                    {pkg.credits}
                  </span>
                  <span className="whitespace-nowrap text-sm font-medium text-gray-600 dark:text-slate-400">
                    deneme hakkı
                  </span>
                </p>

                <div className="text-right md:mt-4 md:border-t md:border-gray-100 md:pt-4 md:text-left dark:md:border-slate-800">
                  <p className="text-lg font-semibold text-gray-900 tabular-nums md:text-xl dark:text-slate-100">
                    {formatTry(pkg.price_kurus)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    <span className="whitespace-nowrap">
                      {pkg.credits > 1 ? `Deneme başı ${formatTry(perCredit)}` : 'Tek deneme'}
                    </span>
                    {saving > 0 && (
                      <span className="block font-semibold text-green-700 md:ml-1.5 md:inline dark:text-green-400">
                        <span className="hidden md:inline">· </span>
                        {formatTry(saving)} kazanç
                      </span>
                    )}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {selected && (
        <section
          aria-label="Ödeme özeti"
          className="mt-5 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-lg dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-semibold">{selected.credits} deneme hakkı</span>
              {balance !== null && (
                <span className="text-gray-400">
                  {' '}
                  · sonrasında {balance + selected.credits} hakkın olacak
                </span>
              )}
            </p>
            <div className="flex items-center justify-between gap-5">
              <p className="text-2xl font-semibold tabular-nums">
                {formatTry(selected.price_kurus)}
              </p>
              <button
                type="button"
                onClick={handleCheckout}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Ödemeye geç →
              </button>
            </div>
          </div>
          {checkoutNotice && (
            <p role="status" className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm text-gray-200">
              Online ödeme çok yakında aktif olacak. Açıldığında bu paketi tek tıkla
              satın alabileceksin.
            </p>
          )}
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-gray-600 dark:text-slate-400">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {perks.map((perk) => (
            <li key={perk} className="flex items-center gap-1.5">
              <span className="text-blue-600 dark:text-blue-400">
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
              {perk}
            </li>
          ))}
        </ul>
        <Link
          to={routes.denemeler}
          className="hover:text-gray-900 dark:hover:text-slate-100"
        >
          ← Denemelere dön
        </Link>
      </div>

      {paidOrders.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-gray-900 dark:text-slate-100">
            Satın alma geçmişi
          </h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {paidOrders.map((order) => (
              <li
                key={order.id}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="text-gray-900 dark:text-slate-100">
                  {order.package_name}
                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                    {formatIstanbulDateTimeShort(order.paid_at ?? order.created_at)}
                  </span>
                </span>
                <span className="font-medium text-gray-900 tabular-nums dark:text-slate-100">
                  {formatTry(order.amount_kurus)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function PaketlerPage() {
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [paidOrders, setPaidOrders] = useState<CreditOrder[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(async () => {
    try {
      const [pkgs, orders, credits] = await Promise.all([
        getCreditPackages(),
        getMyCreditOrders(),
        getMyCredits(),
      ])
      setPackages(pkgs)
      setPaidOrders(orders.filter((order) => order.status === 'paid'))
      setBalance(credits.balance)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-700 dark:text-red-300">
        Paketler yüklenemedi.{' '}
        <button type="button" onClick={() => void load()} className="font-medium underline">
          Yeniden dene
        </button>
      </p>
    )
  }

  return <PackagePicker packages={packages} balance={balance} paidOrders={paidOrders} />
}
