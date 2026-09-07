import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useServerClock } from '../../hooks/useServerClock'
import {
  formatCountdown,
  formatIstanbulDateTimeShort,
} from '../../lib/istanbul-time'
import { getAttemptReview, getReviewErrorMessage } from '../../lib/exam-review'
import type { AttemptReviewEmbargo } from '../../types/exam-review'
import { SITE_NAME } from '../../lib/brand'

const POLL_MS = 15_000

export function ExamCompletionPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const { serverNow } = useServerClock()

  const [embargo, setEmbargo] = useState<AttemptReviewEmbargo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const countdownSeconds = useMemo(() => {
    if (!embargo?.results_publish_at || !serverNow) return 0
    const target = new Date(embargo.results_publish_at).getTime()
    return Math.max(0, Math.floor((target - serverNow.getTime()) / 1000))
  }, [embargo?.results_publish_at, serverNow])

  useEffect(() => {
    if (!attemptId) return

    const load = async () => {
      try {
        const data = await getAttemptReview(attemptId)
        if ('embargo' in data && data.embargo) {
          setEmbargo(data)
          return
        }
        navigate(`/sonuclar/${attemptId}`, { replace: true })
      } catch (err) {
        setError(getReviewErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    void load()

    const interval = window.setInterval(() => {
      getAttemptReview(attemptId)
        .then((data) => {
          if ('embargo' in data && data.embargo) {
            setEmbargo(data)
            return
          }
          navigate(`/sonuclar/${attemptId}`, { replace: true })
        })
        .catch(() => {})
    }, POLL_MS)

    return () => window.clearInterval(interval)
  }, [attemptId, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Yükleniyor…</p>
      </div>
    )
  }

  if (error || !embargo) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-700">{error ?? 'Bilgi bulunamadı.'}</p>
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
        >
          Denemelere dön
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {SITE_NAME}
      </p>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">
        {embargo.exam_title}
      </h1>

      <p className="mt-8 text-base text-gray-900">Sınavınız tamamlandı.</p>

      <p className="mt-4 text-sm text-gray-600">
        Sonuçlar{' '}
        <span className="font-medium text-gray-900">
          {formatIstanbulDateTimeShort(embargo.results_publish_at)}
        </span>
        {' '}tarihinde açıklanacaktır.
      </p>

      {countdownSeconds > 0 && (
        <p className="mt-4 text-sm text-gray-500">
          Kalan süre:{' '}
          <span className="font-medium tabular-nums text-gray-700">
            {formatCountdown(countdownSeconds)}
          </span>
        </p>
      )}

      <Link
        to="/denemeler"
        className="mt-10 inline-block text-sm text-gray-600 hover:text-gray-900"
      >
        Denemelere dön
      </Link>
    </div>
  )
}
