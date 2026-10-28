/**
 * Static, illustrative mock-ups of the exam and analysis screens.
 * Everything shown here is invented sample data, not real users or results.
 */

function SampleBadge() {
  return (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
      Örnek ekran · örnek veriler
    </span>
  )
}

const frame =
  'rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'

function ExamSample() {
  const options = ['A', 'B', 'C', 'D', 'E']
  return (
    <figure className={frame} aria-label="Örnek sınav ekranı">
      <div className="flex items-center justify-between gap-2">
        <SampleBadge />
        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">
          01:42:15
        </span>
      </div>
      <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">Soru 12 / 120</p>
      <p className="mt-2 text-sm text-gray-900 dark:text-slate-100">
        Örnek soru metni burada görünür. Gerçek sorular deneme başladığında
        açılır.
      </p>
      <ul className="mt-4 space-y-2" aria-hidden="true">
        {options.map((key, index) => (
          <li
            key={key}
            className={`rounded-md border px-3 py-2 text-xs ${
              index === 1
                ? 'border-gray-900 bg-gray-50 text-gray-900 dark:border-blue-500 dark:bg-slate-950 dark:text-slate-100'
                : 'border-gray-200 text-gray-600 dark:border-slate-800 dark:text-slate-400'
            }`}
          >
            {key}. Örnek seçenek metni
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[11px] ${
              n === 12
                ? 'border-gray-900 bg-gray-900 text-white dark:border-blue-600 dark:bg-blue-600'
                : n % 3 === 0
                  ? 'border-gray-200 text-gray-500 dark:border-slate-800 dark:text-slate-500'
                  : 'border-gray-400 bg-gray-100 text-gray-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {n}
          </span>
        ))}
      </div>
      <figcaption className="mt-4 text-xs text-gray-500 dark:text-slate-400">
        Sorulara “Sonra dön” işareti koyabilir, boş ve işaretli sorulara hızlıca
        geçebilirsiniz.
      </figcaption>
    </figure>
  )
}

function AnalysisSample() {
  const rows = [
    { name: 'Örnek ders A', value: 82 },
    { name: 'Örnek ders B', value: 64 },
    { name: 'Örnek ders C', value: 47 },
  ]
  return (
    <figure className={frame} aria-label="Örnek performans ekranı">
      <SampleBadge />
      <p className="mt-4 text-sm font-medium text-gray-900 dark:text-slate-100">
        Ders bazında performans
      </p>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex justify-between text-xs text-gray-700 dark:text-slate-300">
              <span>{row.name}</span>
              <span className="tabular-nums">%{row.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gray-800 dark:bg-blue-500"
                style={{ width: `${row.value}%` }}
              />
            </div>
          </li>
        ))}
        <li className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>Örnek ders D</span>
          <span>Henüz veri yok</span>
        </li>
      </ul>
      <figcaption className="mt-4 text-xs text-gray-500 dark:text-slate-400">
        Standart 19 ders için sonuçlarınız ve konu kırılımı bu ekranda toplanır.
      </figcaption>
    </figure>
  )
}

function ResultSample() {
  const stats = [
    ['Doğru', '72'],
    ['Yanlış', '31'],
    ['Boş', '17'],
  ]
  return (
    <figure className={frame} aria-label="Örnek sonuç ve sıralama ekranı">
      <SampleBadge />
      <p className="mt-4 text-sm font-medium text-gray-900 dark:text-slate-100">
        Örnek Deneme 1
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-gray-200 py-2 dark:border-slate-800"
          >
            <dt className="text-[11px] text-gray-500 dark:text-slate-400">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-gray-600 dark:text-slate-400">
        Bu denemenin katılımcıları arasındaki sıralama
      </p>
      <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">
        48 <span className="text-sm font-normal text-gray-500">/ 310</span>
      </p>
      <figcaption className="mt-4 text-xs text-gray-500 dark:text-slate-400">
        Sonuçlar açıklandığında cevap anahtarı ve sıralama birlikte görünür.
      </figcaption>
    </figure>
  )
}

export function SampleScreens() {
  return (
    <section
      id="ornekler"
      className="scroll-mt-20 border-t border-gray-200 dark:border-slate-800"
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Deneyime göz atın
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-slate-400">
            Aşağıdaki ekranlar örnektir; içindeki ders adı, puan ve sıralamalar
            uydurmadır ve gerçek bir kullanıcıya ait değildir.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <ExamSample />
          <AnalysisSample />
          <ResultSample />
        </div>
      </div>
    </section>
  )
}
