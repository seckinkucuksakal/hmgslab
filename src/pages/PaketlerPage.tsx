import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  cancelCreditOrder,
  createCreditOrder,
  creditOrderStatusLabels,
  formatTry,
  getCreditPackages,
  getMyCreditOrders,
  getMyCredits,
  type CreditOrder,
  type CreditPackage,
} from '../lib/credits'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import { routes } from '../lib/routes'

function orderErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (message.includes('Paket bulunamadı')) return 'Bu paket şu an satışta değil.'
    if (message.includes('İptal edilebilecek')) return 'Bu sipariş artık iptal edilemez.'
  }
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

function savingsNote(pkg: CreditPackage, single: CreditPackage | undefined): string | null {
  if (!single || pkg.id === single.id || pkg.credits <= 1) return null
  const full = single.price_kurus * pkg.credits
  if (pkg.price_kurus >= full) return null
  return `Deneme başı ${formatTry(Math.round(pkg.price_kurus / pkg.credits))} · ${formatTry(full - pkg.price_kurus)} tasarruf`
}

export function PaketlerPage() {
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [orders, setOrders] = useState<CreditOrder[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [activeOrder, setActiveOrder] = useState<CreditOrder | null>(null)

  const load = useCallback(async () => {
    try {
      const [pkgs, myOrders, credits] = await Promise.all([
        getCreditPackages(),
        getMyCreditOrders(),
        getMyCredits(),
      ])
      setPackages(pkgs)
      setOrders(myOrders)
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

  const handleBuy = async (pkg: CreditPackage) => {
    setBusy(pkg.id)
    setError(null)
    try {
      const order = await createCreditOrder(pkg.id)
      setActiveOrder(order)
      void load()
    } catch (err) {
      setError(orderErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async (order: CreditOrder) => {
    setBusy(order.id)
    setError(null)
    try {
      await cancelCreditOrder(order.id)
      if (activeOrder?.id === order.id) setActiveOrder(null)
      await load()
    } catch (err) {
      setError(orderErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const single = packages.find((p) => p.credits === 1)

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Deneme hakkı satın al</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Her denemeye kayıt 1 hak kullanır. Satın aldığınız haklar süresizdir.
      </p>

      {balance !== null && (
        <p className="mt-4 text-sm text-gray-700">
          Kalan deneme hakkınız:{' '}
          <span className="font-semibold text-gray-900">{balance}</span>
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : loadError ? (
        <p className="mt-6 text-sm text-red-700">
          Paketler yüklenemedi.{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Yeniden dene
          </button>
        </p>
      ) : (
        <>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {packages.map((pkg) => {
              const note = savingsNote(pkg, single)
              return (
                <li
                  key={pkg.id}
                  className="flex flex-col rounded-xl border border-gray-200 bg-white p-5"
                >
                  <h2 className="text-base font-semibold text-gray-900">{pkg.name}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {pkg.credits} deneme hakkı
                  </p>
                  <p className="mt-4 text-2xl font-semibold text-gray-900">
                    {formatTry(pkg.price_kurus)}
                  </p>
                  {note && <p className="mt-1 text-xs text-green-700">{note}</p>}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void handleBuy(pkg)}
                    className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {busy === pkg.id ? 'Hazırlanıyor…' : 'Satın al'}
                  </button>
                </li>
              )
            })}
          </ul>

          {activeOrder && activeOrder.status === 'pending' && (
            <section
              aria-labelledby="checkout-heading"
              className="mt-8 rounded-xl border border-gray-900 bg-gray-50 p-5"
            >
              <h2 id="checkout-heading" className="text-base font-semibold text-gray-900">
                Sipariş özeti
              </h2>
              <dl className="mt-3 space-y-1 text-sm text-gray-700">
                <div className="flex justify-between gap-4">
                  <dt>Paket</dt>
                  <dd className="font-medium">{activeOrder.package_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Deneme hakkı</dt>
                  <dd className="font-medium">{activeOrder.credits}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Tutar</dt>
                  <dd className="font-semibold text-gray-900">
                    {formatTry(activeOrder.amount_kurus)}
                  </dd>
                </div>
              </dl>

              {/* Payment provider goes here: start the provider's checkout for
                  activeOrder.id; its webhook fulfils the order on the server. */}
              <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                Online ödeme yakında aktif olacak. Siparişiniz kaydedildi; ödeme
                tamamlandığında haklarınız hesabınıza otomatik tanımlanır.
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Ödemeye geç
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleCancel(activeOrder)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Siparişi iptal et
                </button>
              </div>
            </section>
          )}

          {orders.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-medium text-gray-900">Siparişlerim</h2>
              <ul className="mt-3 divide-y divide-gray-200 border-y border-gray-200">
                {orders.map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {order.package_name} · {formatTry(order.amount_kurus)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {creditOrderStatusLabels[order.status]} ·{' '}
                        {formatIstanbulDateTimeShort(order.created_at)}
                      </p>
                    </div>
                    {order.status === 'pending' && (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveOrder(order)}
                          className="text-sm font-medium text-gray-900 underline"
                        >
                          Ödemeye dön
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void handleCancel(order)}
                          className="text-sm text-gray-600 underline disabled:opacity-50"
                        >
                          İptal et
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-8 text-sm">
        <Link to={routes.denemeler} className="text-gray-600 underline hover:text-gray-900">
          Denemelere dön
        </Link>
      </p>
    </div>
  )
}
