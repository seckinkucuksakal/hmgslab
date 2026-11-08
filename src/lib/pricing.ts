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
 * Per-exam pricing: the first exam is free, every further exam is bought on
 * its own. The price mirrors the 'single' row of public.credit_packages, which
 * is the source of truth at checkout; keep the two in sync.
 */
export const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: 'İlk deneme ücretsiz',
    priceLabel: 'Ücretsiz',
    description: 'Kayıt ol, ilk denemene ücretsiz katıl.',
    features: [
      'Canlı sınav veya serbest deneme',
      'Sonuç ve cevap incelemesi',
      'Ders ve konu bazlı performans analizi',
      'Türkiye geneli sıralama',
    ],
    highlighted: true,
    available: true,
    ctaLabel: 'Ücretsiz kayıt ol',
    ctaHref: routes.kayit,
  },
  {
    id: 'single',
    name: 'Deneme başı',
    priceLabel: '149,90 TL',
    description: 'Sonraki her deneme ayrı ayrı satın alınır; paket zorunluluğu yok.',
    features: [
      'İstediğin denemeye katıl',
      'Canlı sınavda katılmazsan ücretin bir sonraki denemen için kalır',
      'Sonuç, inceleme ve sıralama dahil',
    ],
    available: true,
    ctaLabel: 'Denemeleri gör',
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
