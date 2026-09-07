import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  ATTEMPT_RESULTS_PAGE_SIZE,
  fetchAttemptResults,
  getReviewErrorMessage,
} from '../lib/exam-review'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import { formatExamScore } from '../lib/exam-score'
import type { AttemptResultListItem } from '../types/exam-review'
import { isResultEmbargo } from '../types/exam-review'

export function SonuclarPage() {
  const { user } = useAuth()
  const [results, setResults] = useState<AttemptResultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    fetchAttemptResults(user.id)
      .then(setResults)
      .catch((err) => setError(getReviewErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Sonuçlar</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Tamamladığınız denemelerin sonuçları ve cevap incelemeleri.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          Henüz tamamladığınız bir deneme bulunmuyor.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
          {results.map((result) => (
            <li key={result.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/sonuclar/${result.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {result.exam_title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      {result.submitted_at
                        ? new Date(result.submitted_at).toLocaleDateString(
                            'tr-TR',
                            {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            },
                          )
                        : '—'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{result.total_questions} soru</span>
                    {!isResultEmbargo(result) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatExamScore(result.completion_percent)} puan</span>
                      </>
                    )}
                  </div>
                  {isResultEmbargo(result) ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Sonuçlar{' '}
                      {formatIstanbulDateTimeShort(result.results_publish_at)}{' '}
                      tarihinde açıklanacak
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600">
                      <span>{result.correct_count} doğru</span>
                      <span>{result.incorrect_count} yanlış</span>
                      <span>{result.blank_count} boş</span>
                    </div>
                  )}
                </div>
                <Link
                  to={`/sonuclar/${result.id}`}
                  className="text-sm text-gray-900 hover:underline"
                >
                  {isResultEmbargo(result) ? 'Bekle' : 'İncele'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && results.length >= ATTEMPT_RESULTS_PAGE_SIZE && (
        <p className="mt-4 text-xs text-gray-500">
          En son {ATTEMPT_RESULTS_PAGE_SIZE} deneme gösteriliyor.
        </p>
      )}
    </div>
  )
}
