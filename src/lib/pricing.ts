import { routes } from './routes'

export type PricingPlan = {
  id: string
  name: string
  /** Shown instead of an amount: no price is final until billing goes live. */
  priceLabel: string
  description: string
  features: string[]
  highlighted?: boolean
  /** False while the plan cannot be purchased yet; the call to action is inactive. */
  available: boolean
  ctaLabel: string
  ctaHref: string
}

/**
 * Credit model: one free exam on sign-up, then exam credits bought in packages
 * of 1 or 10 (no expiry). Payments are not connected yet, so the paid packages
 * are announced without prices or any purchase action.
 */
export const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: 'İlk deneme ücretsiz',
    priceLabel: 'Ücretsiz',
    description: 'Kayıt olun, ilk denemenize ücretsiz katılın.',
    features: [
      '1 deneme hakkı hediye',
      'Sonuç ve cevap incelemesi',
      'Ders ve konu bazlı performans analizi',
      'Denemenin katılımcıları arasında sıralama',
    ],
    highlighted: true,
    available: true,
    ctaLabel: 'Ücretsiz kayıt ol',
    ctaHref: routes.kayit,
  },
  {
    id: 'single',
    name: '1 deneme',
    priceLabel: 'Fiyat açıklanacak',
    description: 'Tek bir deneme veya canlı sınav için 1 hak.',
    features: ['Süresiz geçerli', 'Ödeme sistemi devreye girdiğinde satışa açılacak'],
    available: false,
    ctaLabel: 'Yakında',
    ctaHref: routes.kayit,
  },
  {
    id: 'pack10',
    name: '10 deneme',
    priceLabel: 'Fiyat açıklanacak',
    description: '10 deneme veya canlı sınav için 10 hak.',
    features: ['Süresiz geçerli', 'Ödeme sistemi devreye girdiğinde satışa açılacak'],
    available: false,
    ctaLabel: 'Yakında',
    ctaHref: routes.kayit,
  },
]

export const landingFeatures = [
  {
    title: 'Canlı sınav deneyimi',
    description:
      'Gerçek HMGS formatında, planlı saatlerde başlayan denemeler. Sunucu saatiyle güvenilir zamanlama.',
  },
  {
    title: 'Performans takibi',
    description:
      'Ders ve konu bazında güçlü/zayıf alanlarınızı görün; ilerlemenizi grafiklerle izleyin.',
  },
  {
    title: 'Sonuç ve inceleme',
    description:
      'Sınav bitince cevap anahtarı, açıklamalar ve sıralama — hepsi tek ekranda.',
  },
] as const
