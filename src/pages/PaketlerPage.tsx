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

const perks = [
  { title: 'Süresiz haklar', text: 'Aldığın haklar hiç sona ermez.' },
  { title: '1 kayıt = 1 hak', text: 'Deneme ya da canlı sınav fark etmez.' },
  { title: 'Otomatik iade', text: 'Katılmadığın canlı sınavın hakkı geri yüklenir.' },
]

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
    <div className="mx-auto max-w-5xl">
      <header className="text-center">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          Deneme hakkı
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl dark:text-slate-100">
          Hazırlığına hız ver
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 dark:text-slate-400">
          Paketini seç, dilediğin denemeye kaydol. Ne kadar çok alırsan deneme
          başı o kadar avantajlı.
        </p>
        {balance !== null && (
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Şu an
            <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {balance}
            </span>
            deneme hakkın var
          </p>
        )}
      </header>

      <fieldset className="mt-12">
        <legend className="sr-only">Paket seçimi</legend>
        <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
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
                  'group relative flex cursor-pointer flex-col rounded-3xl border bg-white p-6 transition-all duration-200 dark:bg-slate-900',
                  // keyboard focus only; a mouse click must not add a second ring
                  'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-blue-500 has-[input:focus-visible]:ring-offset-2 dark:has-[input:focus-visible]:ring-offset-slate-950',
                  isSelected
                    ? 'border-blue-600 shadow-xl shadow-blue-600/10 ring-1 ring-blue-600 md:-translate-y-1 dark:border-blue-500 dark:ring-blue-500'
                    : 'border-gray-200 shadow-sm hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-slate-800 dark:hover:border-slate-700',
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
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    En avantajlı
                  </span>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
                    {pkg.credits === 1 ? 'Tekli' : `${pkg.credits}'li paket`}
                  </span>
                  <span
                    aria-hidden
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition',
                      isSelected
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'border-2 border-gray-300 dark:border-slate-600',
                    ].join(' ')}
                  >
                    {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                </div>

                <p className="mt-5 flex items-baseline gap-2">
                  <span className="text-5xl font-semibold tracking-tight text-gray-900 tabular-nums dark:text-slate-100">
                    {pkg.credits}
                  </span>
                  <span className="text-base font-medium text-gray-600 dark:text-slate-400">
                    deneme hakkı
                  </span>
                </p>

                <div className="mt-6 border-t border-gray-100 pt-5 dark:border-slate-800">
                  <p className="text-2xl font-semibold text-gray-900 tabular-nums dark:text-slate-100">
                    {formatTry(pkg.price_kurus)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    {pkg.credits > 1
                      ? `Deneme başı ${formatTry(perCredit)}`
                      : 'Tek seferlik deneme'}
                  </p>
                </div>

                <div className="mt-4 min-h-7">
                  {saving > 0 && (
                    <span className="inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-600/20 dark:bg-green-950/40 dark:text-green-400">
                      {formatTry(saving)} kazanç
                    </span>
                  )}
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      {selected && (
        <section
          aria-label="Ödeme özeti"
          className="mt-10 rounded-3xl bg-gray-900 p-6 text-white shadow-xl sm:p-8 dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-400">Seçimin</p>
              <p className="mt-1 text-lg font-semibold">
                {selected.credits} deneme hakkı
                {balance !== null && (
                  <span className="font-normal text-gray-400">
                    {' '}
                    · toplam {balance + selected.credits} hakkın olacak
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <p className="text-3xl font-semibold tabular-nums">
                {formatTry(selected.price_kurus)}
              </p>
              <button
                type="button"
                onClick={handleCheckout}
                className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Ödemeye geç →
              </button>
            </div>
          </div>
          {checkoutNotice && (
            <p
              role="status"
              className="mt-5 rounded-xl bg-white/10 px-4 py-3 text-sm text-gray-200"
            >
              Online ödeme çok yakında aktif olacak. Açıldığında bu paketi tek
              tıkla satın alabileceksin.
            </p>
          )}
        </section>
      )}

      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {perks.map((perk) => (
          <li key={perk.title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm">
              <span className="block font-medium text-gray-900 dark:text-slate-100">
                {perk.title}
              </span>
              <span className="text-gray-600 dark:text-slate-400">{perk.text}</span>
            </span>
          </li>
        ))}
      </ul>

      {paidOrders.length > 0 && (
        <section className="mt-14">
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

      <p className="mt-12 text-center text-sm">
        <Link
          to={routes.denemeler}
          className="text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          ← Denemelere dön
        </Link>
      </p>
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
