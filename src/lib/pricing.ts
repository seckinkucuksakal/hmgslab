import { routes } from './routes'

export type PricingPlan = {
  id: string
  name: string
  price: string
  period: string
  description: string
  features: string[]
  highlighted?: boolean
  ctaLabel: string
  ctaHref: string
}

/** Placeholder plans — update amounts when billing goes live. */
export const pricingPlans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Başlangıç',
    price: '0 ₺',
    period: '',
    description: 'Platformu keşfedin ve ilk denemenizi çözün.',
    features: [
      '1 ücretsiz deneme',
      'Temel sonuç özeti',
      'Cevap anahtarı inceleme',
    ],
    ctaLabel: 'Ücretsiz kayıt ol',
    ctaHref: routes.kayit,
  },
  {
    id: 'monthly',
    name: 'Aylık',
    price: '299 ₺',
    period: '/ ay',
    description: 'Düzenli çalışma için esnek erişim.',
    features: [
      'Tüm planlı canlı denemeler',
      'Performans ve konu analizi',
      'Sıralama ve geçmiş sonuçlar',
      'Öncelikli destek',
    ],
    highlighted: true,
    ctaLabel: 'Aylık pakete başla',
    ctaHref: routes.kayit,
  },
  {
    id: 'season',
    name: 'Sezon',
    price: '1.499 ₺',
    period: '/ sezon',
    description: 'HMGS hazırlık döneminiz boyunca tam erişim.',
    features: [
      'Aylık paketteki her şey',
      'Sezon boyunca sınırsız deneme',
      'Detaylı ilerleme raporları',
      'Erken erişim yeni denemelere',
    ],
    ctaLabel: 'Sezon paketine başla',
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
