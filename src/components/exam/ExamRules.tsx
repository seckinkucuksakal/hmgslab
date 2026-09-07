/** Fixed HMGSlab exam rules — text can be replaced centrally later. */
export const EXAM_RULES = [
  'Sınav süresi HMGSlab sunucu saatine göre işler; cihaz saatiniz dikkate alınmaz.',
  'Sınav başladıktan sonra sorular arasında gezinip cevaplarınızı kaydedebilirsiniz.',
  'Erken bitirme mümkündür; bitirdikten sonra cevaplar değiştirilemez.',
  'Sonuçlar, sınav takviminde belirtilen saatte açıklanır.',
  'Sınav esnasında dış kaynaklardan yardım almak yasaktır.',
] as const

export function ExamRules({ className = '' }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-sm font-medium text-gray-900">Sınav kuralları</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-600">
        {EXAM_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </section>
  )
}
