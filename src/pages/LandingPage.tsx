import { Link, Navigate } from 'react-router-dom'
import { LandingLayout } from '../components/layout/LandingLayout'
import { useAuth } from '../hooks/useAuth'
import { SITE_NAME } from '../lib/brand'
import { landingFeatures, pricingPlans } from '../lib/pricing'
import { routes } from '../lib/routes'

export function LandingPage() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Yükleniyor…
      </div>
    )
  }

  if (session) {
    return <Navigate to={routes.home} replace />
  }

  return (
    <LandingLayout>
      <section className="border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-slate-400">
            HMGS hazırlık platformu
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-slate-100">
            Gerçek sınav ritminde deneme, analiz ve sonuç
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg dark:text-slate-400">
            {SITE_NAME} ile planlı canlı denemelere katılın, performansınızı ders
            bazında takip edin ve HMGS&apos;ye hazırlığınızı veriye dayalı
            yönetin.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={routes.kayit}
              className="rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Ücretsiz başla
            </Link>
            <Link
              to={routes.giris}
              className="rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Giriş yap
            </Link>
          </div>
        </div>
      </section>

      <section
        id="ozellikler"
        className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Neden {SITE_NAME}?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-slate-400">
            Sadece soru çözmek değil; sınav gününe yakın bir deneyim sunuyoruz.
          </p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-3">
          {landingFeatures.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <h3 className="text-base font-medium text-gray-900 dark:text-slate-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="fiyatlar"
        className="scroll-mt-20 border-t border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
              Fiyatlar
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-slate-400">
              İhtiyacınıza uygun paketi seçin. Ödeme altyapısı yakında devreye
              alınacak; şimdilik kayıt olun ve duyurulardan haberdar olun.
            </p>
          </div>

          <ul className="mt-12 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <li
                key={plan.id}
                className={[
                  'flex flex-col rounded-xl border p-6',
                  plan.highlighted
                    ? 'border-gray-900 bg-gray-50 shadow-sm ring-1 ring-gray-900/10 dark:border-blue-600 dark:bg-slate-950 dark:ring-blue-600/30'
                    : 'border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900',
                ].join(' ')}
              >
                {plan.highlighted && (
                  <span className="mb-4 inline-flex w-fit rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-blue-600">
                    Popüler
                  </span>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {plan.description}
                </p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      {plan.period}
                    </span>
                  )}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-gray-600 dark:text-slate-400">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-gray-400 dark:text-slate-500">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.ctaHref}
                  className={[
                    'mt-8 block rounded-md px-4 py-2.5 text-center text-sm font-medium',
                    plan.highlighted
                      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                      : 'border border-gray-300 text-gray-800 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  {plan.ctaLabel}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-center text-xs text-gray-500 dark:text-slate-500">
            Fiyatlar bilgilendirme amaçlıdır ve ödeme entegrasyonu öncesinde
            değişebilir.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
          Hazırlığa bugün başlayın
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-gray-600 dark:text-slate-400">
          Hesap oluşturun; planlı denemeler açıklandığında ilk siz haberdar olun.
        </p>
        <Link
          to={routes.kayit}
          className="mt-8 inline-flex rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          Kayıt ol
        </Link>
      </section>
    </LandingLayout>
  )
}
