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
 * Payment provider goes here: "Ödemeye geç" should call createCreditOrder()
 * and hand the order id to the provider's checkout; the provider's webhook
 * then fulfils the order on the server (private.fulfill_credit_order).
 */
const PAYMENTS_ENABLED = false

const perks = [
  'Haklar süresizdir, istediğiniz zaman kullanın.',
  'Her deneme veya canlı sınav kaydı 1 hak kullanır.',
  'Katılmadığınız canlı sınavın hakkı otomatik iade edilir.',
]

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function PaketlerPage() {
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [paidOrders, setPaidOrders] = useState<CreditOrder[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Deneme hakkı al
          </h1>
          <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-slate-400">
            Paketini seç, denemelere kaydol. Satın aldığın haklar hiçbir zaman
            sona ermez.
          </p>
        </div>
        {balance !== null && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-right dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-gray-500 dark:text-slate-400">Mevcut hakkın</p>
            <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {balance}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-gray-500">Yükleniyor…</p>
      ) : loadError ? (
        <p className="mt-10 text-sm text-red-700 dark:text-red-300">
          Paketler yüklenemedi.{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Yeniden dene
          </button>
        </p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <fieldset>
            <legend className="sr-only">Paket seçimi</legend>
            <div className="grid gap-4 sm:grid-cols-2">
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
                      'relative flex cursor-pointer flex-col rounded-2xl border-2 bg-white p-5 transition dark:bg-slate-900',
                      isSelected
                        ? 'border-gray-900 shadow-md dark:border-blue-500'
                        : 'border-gray-200 hover:border-gray-300 dark:border-slate-800 dark:hover:border-slate-700',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="package"
                      value={pkg.id}
                      checked={isSelected}
                      onChange={() => setSelectedId(pkg.id)}
                      className="sr-only"
                    />
                    {isBest && (
                      <span className="absolute -top-3 left-5 rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-blue-600">
                        En avantajlı
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                          {pkg.name}
                        </p>
                        <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">
                          {formatTry(pkg.price_kurus)}
                        </p>
                      </div>
                      <span
                        aria-hidden
                        className={[
                          'mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2',
                          isSelected
                            ? 'border-gray-900 dark:border-blue-500'
                            : 'border-gray-300 dark:border-slate-600',
                        ].join(' ')}
                      >
                        {isSelected && (
                          <span className="h-2.5 w-2.5 rounded-full bg-gray-900 dark:bg-blue-500" />
                        )}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
                      {pkg.credits > 1
                        ? `Deneme başı ${formatTry(perCredit)}`
                        : 'Tek bir deneme için'}
                    </p>
                    {saving > 0 && (
                      <p className="mt-1 text-sm font-medium text-green-700 dark:text-green-400">
                        {formatTry(saving)} tasarruf
                      </p>
                    )}
                  </label>
                )
              })}
            </div>

            <ul className="mt-6 space-y-2 text-sm text-gray-600 dark:text-slate-400">
              {perks.map((perk) => (
                <li key={perk} className="flex gap-2">
                  <span className="text-green-600 dark:text-green-400">
                    <CheckIcon />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          </fieldset>

          {selected && (
            <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-5 lg:sticky lg:top-24 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-medium text-gray-900 dark:text-slate-100">
                Özet
              </h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4 text-gray-600 dark:text-slate-400">
                  <dt>{selected.name}</dt>
                  <dd>{formatTry(selected.price_kurus)}</dd>
                </div>
                <div className="flex justify-between gap-4 text-gray-600 dark:text-slate-400">
                  <dt>Eklenecek hak</dt>
                  <dd>+{selected.credits}</dd>
                </div>
                {balance !== null && (
                  <div className="flex justify-between gap-4 text-gray-600 dark:text-slate-400">
                    <dt>Satın alma sonrası</dt>
                    <dd>{balance + selected.credits} hak</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 text-base font-semibold text-gray-900 dark:border-slate-800 dark:text-slate-100">
                  <dt>Toplam</dt>
                  <dd>{formatTry(selected.price_kurus)}</dd>
                </div>
              </dl>

              <button
                type="button"
                disabled={!PAYMENTS_ENABLED}
                className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                Ödemeye geç
              </button>
              {!PAYMENTS_ENABLED && (
                <p className="mt-3 text-center text-xs text-gray-500 dark:text-slate-400">
                  Online ödeme çok yakında aktif olacak.
                </p>
              )}
            </aside>
          )}
        </div>
      )}

      {paidOrders.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-medium text-gray-900 dark:text-slate-100">
            Satın alma geçmişi
          </h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {paidOrders.map((order) => (
              <li
                key={order.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="text-gray-900 dark:text-slate-100">
                  {order.package_name}
                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                    {formatIstanbulDateTimeShort(order.paid_at ?? order.created_at)}
                  </span>
                </span>
                <span className="font-medium text-gray-900 dark:text-slate-100">
                  {formatTry(order.amount_kurus)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-sm">
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
