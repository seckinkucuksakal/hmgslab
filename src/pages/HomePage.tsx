import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import {
  fetchRecentAttemptResults,
} from '../lib/exam-review'
import type { AttemptResultListItem } from '../types/exam-review'

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

  const recentAverage =
    recentResults.length > 0
      ? Math.round(
          (recentResults.reduce(
            (sum, result) => sum + result.completion_percent,
            0,
          ) /
            recentResults.length) *
            10,
        ) / 10
      : null

  if (profileLoading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Hoş geldin, {displayName}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        HMGS denemelerine buradan devam edebilirsin.
      </p>

      {recentAverage !== null && (
        <p className="mt-3 text-sm text-gray-600">
          Son {recentResults.length} denemede ortalama{' '}
          <Link to="/performans" className="font-medium text-gray-900 hover:underline">
            %{recentAverage.toLocaleString('tr-TR')} doğru
          </Link>
        </p>
      )}

      <div className="mt-8">
        <Link
          to="/denemeler"
          className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Deneme Çöz
        </Link>
      </div>

      <section className="mt-10 border-t border-gray-200 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-medium text-gray-900">Son Denemeler</h2>
          {recentResults.length > 0 && (
            <Link
              to="/sonuclar"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Tümünü gör
            </Link>
          )}
        </div>

        {resultsLoading ? (
          <p className="mt-3 text-sm text-gray-500">Yükleniyor…</p>
        ) : recentResults.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">
            Henüz tamamladığınız bir deneme bulunmuyor.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
            {recentResults.map((result) => (
              <li key={result.id} className="py-3">
                <Link
                  to={`/sonuclar/${result.id}`}
                  className="block hover:opacity-80"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {result.exam_title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {result.submitted_at
                      ? new Date(result.submitted_at).toLocaleDateString(
                          'tr-TR',
                        )
                      : '—'}{' '}
                    · {result.correct_count} doğru · {result.incorrect_count}{' '}
                    yanlış · {result.blank_count} boş
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
