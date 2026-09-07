import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExamRules } from '../../components/exam/ExamRules'
import { useProfile } from '../../hooks/useProfile'
import { useServerCountdown } from '../../hooks/useServerClock'
import {
  formatCountdown,
  formatIstanbulDateTimeShort,
} from '../../lib/istanbul-time'
import {
  getExamLiveStatus,
  getLiveExamErrorMessage,
  startScheduledExamAttempt,
} from '../../lib/live-exam'
import type { ExamLiveStatus } from '../../types/live-exam'
import { SITE_NAME } from '../../lib/brand'

const POLL_MS = 5_000

export function ExamLobbyPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const { displayName } = useProfile()

  const [status, setStatus] = useState<ExamLiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const autoStartRef = useRef(false)

  const countdownSeconds = useServerCountdown(
    status?.seconds_until_start,
    status?.server_now ?? '',
  )

  const refreshStatus = useCallback(async () => {
    if (!examId) return null

    const next = await getExamLiveStatus(examId)
    setStatus(next)
    return next
  }, [examId])

  useEffect(() => {
    if (!examId) return

    refreshStatus()
      .catch((err) => setError(getLiveExamErrorMessage(err)))
      .finally(() => setLoading(false))

    const interval = window.setInterval(() => {
      refreshStatus().catch(() => {})
    }, POLL_MS)

    return () => window.clearInterval(interval)
  }, [examId, refreshStatus])

  useEffect(() => {
    if (!examId || !status || autoStartRef.current) return

    const tryEnterExam = async () => {
      if (status.user_has_finalized_attempt && status.user_attempt_id) {
        navigate(`/sinav/${status.user_attempt_id}/tamamlandi`, { replace: true })
        return
      }

      if (status.user_attempt_id && status.user_attempt_status === 'in_progress') {
        autoStartRef.current = true
        navigate(`/sinav/${status.user_attempt_id}`, { replace: true })
        return
      }

      if (!status.can_start_exam) return

      autoStartRef.current = true
      setStarting(true)
      setError(null)

      try {
        const attemptId = await startScheduledExamAttempt(examId)
        navigate(`/sinav/${attemptId}`, { replace: true })
      } catch (err) {
        autoStartRef.current = false
        setStarting(false)
        setError(getLiveExamErrorMessage(err))
      }
    }

    void tryEnterExam()
  }, [examId, navigate, status])

  if (loading) {
    return <p className="text-sm text-gray-500">Lobi yükleniyor…</p>
  }

  if (error && !status) {
    return (
      <div>
        <p className="text-sm text-red-700">{error}</p>
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
        >
          Denemelere dön
        </Link>
      </div>
    )
  }

  if (!status) {
    return (
      <p className="text-sm text-gray-600">Sınav bilgisi bulunamadı.</p>
    )
  }

  if (status.exam_mode === 'practice') {
    return <NavigateToDenemeler />
  }

  if (!status.can_enter_lobby) {
    return (
      <div className="mx-auto max-w-lg">
        <Link
          to="/denemeler"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Denemeler
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-gray-900">
          {status.exam_title}
        </h1>
        <p className="mt-6 text-sm text-gray-700">
          Sınav giriş alanı henüz açılmadı.
        </p>
        {status.scheduled_start_at && (
          <p className="mt-2 text-sm text-gray-600">
            Sınav başlangıcı:{' '}
            <span className="font-medium text-gray-900">
              {formatIstanbulDateTimeShort(status.scheduled_start_at)}
            </span>
          </p>
        )}
      </div>
    )
  }

  const showCountdown =
    status.exam_state === 'lobby_open' ||
    (status.exam_state === 'upcoming' && status.can_enter_lobby)

  return (
    <div className="mx-auto max-w-lg">
      <Link
        to="/denemeler"
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        ← Denemeler
      </Link>

      <header className="mt-4 border-b border-gray-200 pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {SITE_NAME}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">
          {status.exam_title}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{displayName}</p>
        {status.exam_description && (
          <p className="mt-2 text-sm text-gray-600">{status.exam_description}</p>
        )}
      </header>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ExamRules className="mt-8" />

      <div className="mt-8 rounded-md border border-gray-200 bg-white px-6 py-8 text-center">
        {starting ? (
          <p className="text-sm text-gray-600">Sınav açılıyor…</p>
        ) : showCountdown ? (
          <>
            <p className="text-sm text-gray-600">Sınavın başlamasına</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">
              {formatCountdown(countdownSeconds)}
            </p>
            {status.scheduled_start_at && (
              <p className="mt-3 text-xs text-gray-500">
                Başlangıç: {formatIstanbulDateTimeShort(status.scheduled_start_at)}
              </p>
            )}
          </>
        ) : status.can_start_exam ? (
          <p className="text-sm text-gray-600">Sınav başlıyor…</p>
        ) : (
          <p className="text-sm text-gray-600">
            Giriş süresi sona erdi veya sınav tamamlandı.
          </p>
        )}
      </div>
    </div>
  )
}

function NavigateToDenemeler() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/denemeler', { replace: true })
  }, [navigate])
  return null
}
