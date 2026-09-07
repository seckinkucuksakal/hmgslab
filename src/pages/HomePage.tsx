import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UpcomingExamCountdown } from '../components/home/UpcomingExamCountdown'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { fetchRecentAttemptResults } from '../lib/exam-review'
import { formatExamScore } from '../lib/exam-score'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import type { AttemptResultListItem } from '../types/exam-review'
import { isResultEmbargo } from '../types/exam-review'

export function HomePage() {
  const { user } = useAuth()
  const { displayName, loading: profileLoading } = useProfile()
  const [recentResults, setRecentResults] = useState<AttemptResultListItem[]>(
    [],
  )
  const [resultsLoading, setResultsLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    fetchRecentAttemptResults(user.id, 3)
      .then(setRecentResults)
      .catch(() => setRecentResults([]))
      .finally(() => setResultsLoading(false))
  }, [user])

  const publishedResults = recentResults.filter((result) => !isResultEmbargo(result))

  const recentAverage =
    publishedResults.length > 0
      ? Math.round(
          (publishedResults.reduce(
            (sum, result) => sum + result.completion_percent,
            0,
          ) /
            publishedResults.length) *
            100,
        ) / 100
      : null

  if (profileLoading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div>
      <div className="text-center sm:text-left">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
          Hoş geldin, {displayName}
        </h1>
        {recentAverage !== null && (
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            Son {publishedResults.length} denemede ortalama{' '}
            <Link
              to="/performans"
              className="font-medium text-gray-900 hover:underline dark:text-slate-100"
            >
              {formatExamScore(recentAverage)} puan
            </Link>
          </p>
        )}
      </div>

      {user && <UpcomingExamCountdown userId={user.id} />}

      <section className="border-t border-gray-200 pt-8 dark:border-slate-800">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-medium text-gray-900 dark:text-slate-100">
            Son Denemeler
          </h2>
          {recentResults.length > 0 && (
            <Link
              to="/sonuclar"
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Tümünü gör
            </Link>
          )}
        </div>

        {resultsLoading ? (
          <p className="mt-3 text-sm text-gray-500">Yükleniyor…</p>
        ) : recentResults.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
            Henüz tamamladığınız bir deneme bulunmuyor.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200 dark:divide-slate-800 dark:border-slate-800">
            {recentResults.map((result) => (
              <li key={result.id} className="py-3">
                <Link
                  to={`/sonuclar/${result.id}`}
                  className="block hover:opacity-80"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {result.exam_title}
                  </p>
                  {isResultEmbargo(result) ? (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                      Sonuçlar{' '}
                      {formatIstanbulDateTimeShort(result.results_publish_at)}{' '}
                      tarihinde açıklanacak
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      {result.submitted_at
                        ? new Date(result.submitted_at).toLocaleDateString(
                            'tr-TR',
                          )
                        : '—'}{' '}
                      · {result.correct_count} doğru · {result.incorrect_count}{' '}
                      yanlış · {result.blank_count} boş
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
