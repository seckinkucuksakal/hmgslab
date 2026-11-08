import { textLink } from '../lib/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  fetchAttemptResultsPage,
  getReviewErrorMessage,
  type ResultsCursor,
} from '../lib/exam-review'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import { formatExamScore } from '../lib/exam-score'
import type { AttemptResultListItem } from '../types/exam-review'
import { isResultEmbargo } from '../types/exam-review'

export function SonuclarPage() {
  const { user } = useAuth()
  const [results, setResults] = useState<AttemptResultListItem[]>([])
  const [cursor, setCursor] = useState<ResultsCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  // Initial page and "load more" share one path; a superseded response
  // (older request id) never overwrites newer state.
  const load = useCallback(async (from: ResultsCursor | null) => {
    const requestId = ++requestRef.current

    try {
      const page = await fetchAttemptResultsPage(from)
      if (requestId !== requestRef.current) return
      setError(null)
      setResults((current) => {
        if (!from) return page.items
        const seen = new Set(current.map((item) => item.id))
        return [...current, ...page.items.filter((item) => !seen.has(item.id))]
      })
      setCursor(page.next_cursor)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(getReviewErrorMessage(err))
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchAttemptResultsPage(null)
      .then((page) => {
        if (cancelled || requestRef.current > 0) return
        setResults(page.items)
        setCursor(page.next_cursor)
      })
      .catch((err) => {
        if (cancelled || requestRef.current > 0) return
        setError(getReviewErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const retry = (from: ResultsCursor | null) => {
    setError(null)
    if (from) setLoadingMore(true)
    else setLoading(true)
    void load(from)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Sonuçlar</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Tamamladığınız denemelerin sonuçları ve cevap incelemeleri.
      </p>

      {error && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => retry(results.length > 0 ? cursor : null)}
            className="font-medium underline"
          >
            Yeniden dene
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : results.length === 0 && !error ? (
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
                    className={`text-sm ${textLink}`}
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
                  className={`text-sm ${textLink}`}
                >
                  {isResultEmbargo(result) ? 'Bekle' : 'İncele'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && cursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => retry(cursor)}
          className="mt-6 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loadingMore ? 'Yükleniyor…' : 'Daha eski sonuçları göster'}
        </button>
      )}
    </div>
  )
}
