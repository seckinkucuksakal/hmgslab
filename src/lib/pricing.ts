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
 * Billing is not connected yet. Today every registered user can use the active
 * exams for free; paid plans are announced as planned, without prices or any
 * purchase action.
 */
export const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Ücretsiz erişim',
    priceLabel: 'Şu an ücretsiz',
    description: 'Kayıt olun, aktif denemeleri hemen çözün.',
    features: [
      'Aktif deneme ve canlı sınavlara katılım',
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
    id: 'monthly',
    name: 'Aylık paket',
    priceLabel: 'Fiyat açıklanacak',
    description: 'Planlanan paket. Kapsamı ve fiyatı henüz belirlenmedi.',
    features: ['Ödeme sistemi devreye girdiğinde duyurulacak'],
    available: false,
    ctaLabel: 'Yakında',
    ctaHref: routes.kayit,
  },
  {
    id: 'season',
    name: 'Sezon paketi',
    priceLabel: 'Fiyat açıklanacak',
    description: 'Planlanan paket. Kapsamı ve fiyatı henüz belirlenmedi.',
    features: ['Ödeme sistemi devreye girdiğinde duyurulacak'],
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
