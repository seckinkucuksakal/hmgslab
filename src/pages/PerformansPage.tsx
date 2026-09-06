import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getPerformanceErrorMessage,
  getUserPerformanceAnalytics,
} from '../lib/performance'
import { PerformanceTrendChart } from '../components/performance/PerformanceTrendChart'
import type { UserPerformanceAnalytics } from '../types/performance'
import { formatPercent } from '../types/performance'

function OverviewSection({ analytics }: { analytics: UserPerformanceAnalytics }) {
  const { overview } = analytics
  if (!overview) return null

  return (
    <section className="border-b border-gray-200 pb-8">
      <h2 className="text-sm font-medium text-gray-900">Genel özet</h2>

      {analytics.is_limited_data && (
        <p className="mt-2 text-sm text-gray-600">
          Analiz sınırlı sayıda deneme sonucuna dayanmaktadır.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-gray-500">Tamamlanan deneme</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            {overview.completed_exams}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Ortalama doğru</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            %{formatPercent(overview.average_correct_percent)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">En iyi performans</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
            %{formatPercent(overview.best_correct_percent)}
          </dd>
          <p className="mt-0.5 text-xs text-gray-500">{overview.best_exam_title}</p>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Son trend</dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900">
            {overview.trend_label ?? '—'}
          </dd>
          {overview.recent_avg_percent !== null &&
            overview.previous_avg_percent !== null && (
              <p className="mt-0.5 text-xs text-gray-500">
                Son 3: %{formatPercent(overview.recent_avg_percent)} · Önceki 3:{' '}
                %{formatPercent(overview.previous_avg_percent)}
              </p>
            )}
        </div>
      </dl>
    </section>
  )
}

function SubjectRow({
  subject,
}: {
  subject: UserPerformanceAnalytics['subjects'][number]
}) {
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {subject.subject_name}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {subject.total} soru · {subject.answered} cevaplanmış ·{' '}
            {subject.correct} doğru · {subject.incorrect} yanlış ·{' '}
            {subject.blank} boş
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
          %{subject.correct_percent}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-800"
          style={{ width: `${subject.correct_percent}%` }}
        />
      </div>
    </li>
  )
}

export function PerformansPage() {
  const [analytics, setAnalytics] = useState<UserPerformanceAnalytics | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getUserPerformanceAnalytics()
      .then(setAnalytics)
      .catch((err) => setError(getPerformanceErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    )
  }

  if (!analytics?.has_data) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Performans</h1>
        <p className="mt-4 text-sm text-gray-600">
          Performans analizi için henüz yeterli deneme veriniz bulunmuyor.
        </p>
        <Link
          to="/denemeler"
          className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Deneme çöz
        </Link>
      </div>
    )
  }

  const sortedSubjects = [...analytics.subjects].sort(
    (a, b) => a.correct_percent - b.correct_percent,
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Performans</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Tamamladığınız denemelere dayalı kişisel performans özeti.
      </p>

      <div className="mt-8 space-y-10">
        <OverviewSection analytics={analytics} />

        <section className="border-b border-gray-200 pb-8">
          <h2 className="text-sm font-medium text-gray-900">Son denemeler</h2>
          <div className="mt-4">
            <PerformanceTrendChart exams={analytics.recent_exams} />
          </div>

          <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
            {analytics.recent_exams.map((exam) => (
              <li key={exam.attempt_id} className="py-3">
                <Link
                  to={`/sonuclar/${exam.attempt_id}`}
                  className="block hover:opacity-80"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {exam.exam_title}
                    </p>
                    <span className="text-sm tabular-nums text-gray-700">
                      %{formatPercent(exam.correct_percent)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {exam.submitted_at
                      ? new Date(exam.submitted_at).toLocaleDateString('tr-TR')
                      : '—'}{' '}
                    · {exam.correct_count} doğru · {exam.incorrect_count}{' '}
                    yanlış · {exam.blank_count} boş
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {(analytics.strongest_subject || analytics.weakest_subject) && (
          <section className="border-b border-gray-200 pb-8">
            <h2 className="text-sm font-medium text-gray-900">
              Güçlü ve gelişim alanları
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              En az {analytics.subject_min_answered} cevaplanmış soru gereklidir.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {analytics.strongest_subject && (
                <div className="rounded-md border border-gray-200 px-4 py-3">
                  <dt className="text-xs text-gray-500">En güçlü ders</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    {analytics.strongest_subject.subject_name}
                  </dd>
                  <dd className="mt-1 text-sm tabular-nums text-gray-700">
                    %{analytics.strongest_subject.correct_percent} ·{' '}
                    {analytics.strongest_subject.answered} cevaplanmış soru
                  </dd>
                </div>
              )}
              {analytics.weakest_subject && (
                <div className="rounded-md border border-gray-200 px-4 py-3">
                  <dt className="text-xs text-gray-500">Gelişim gereken ders</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">
                    {analytics.weakest_subject.subject_name}
                  </dd>
                  <dd className="mt-1 text-sm tabular-nums text-gray-700">
                    %{analytics.weakest_subject.correct_percent} ·{' '}
                    {analytics.weakest_subject.answered} cevaplanmış soru
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {!analytics.strongest_subject && !analytics.weakest_subject && (
          <section className="border-b border-gray-200 pb-8">
            <h2 className="text-sm font-medium text-gray-900">
              Güçlü ve gelişim alanları
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Ders bazında güçlü/zayıf alan analizi için her derste en az{' '}
              {analytics.subject_min_answered} cevaplanmış soru gereklidir.
            </p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-medium text-gray-900">
            Ders bazında performans
          </h2>
          {sortedSubjects.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">
              Ders bazında veri bulunmuyor.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
              {sortedSubjects.map((subject) => (
                <SubjectRow key={subject.subject_id} subject={subject} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
