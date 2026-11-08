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
 * of 1 or 10 (no expiry). Prices mirror public.credit_packages, which is the
 * source of truth at checkout; keep the two in sync.
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
    priceLabel: '149,90 TL',
    description: 'Tek bir deneme veya canlı sınav için 1 hak.',
    features: ['1 deneme hakkı', 'Süresiz geçerli'],
    available: true,
    ctaLabel: 'Satın al',
    ctaHref: routes.paketler,
  },
  {
    id: 'pack10',
    name: '10 deneme',
    priceLabel: '1.350,00 TL',
    description: '10 deneme veya canlı sınav için 10 hak.',
    features: ['10 deneme hakkı', 'Deneme başı 135,00 TL', 'Süresiz geçerli'],
    available: true,
    ctaLabel: 'Satın al',
    ctaHref: routes.paketler,
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
