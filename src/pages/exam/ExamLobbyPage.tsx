import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EXAM_RULES } from '../../components/exam/ExamRules'
import { ExamHall } from '../../components/exam/ExamHall'
import { LobbyChat } from '../../components/exam/LobbyChat'
import { useExamLobby } from '../../hooks/useExamLobby'
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
import { routes } from '../../lib/routes'

const POLL_MS = 5_000

export function ExamLobbyPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<ExamLiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const autoStartRef = useRef(false)

  const lobbyOpen = Boolean(status?.can_enter_lobby && status.exam_mode === 'scheduled')
  const lobby = useExamLobby(examId, lobbyOpen)
  const [joinToast, setJoinToast] = useState<string | null>(null)

  useEffect(() => {
    if (!lobby.lastJoin) return
    setJoinToast(lobby.lastJoin.name)
    const timer = window.setTimeout(() => setJoinToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [lobby.lastJoin])

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
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 mr-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Yeniden dene
        </button>
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
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

  if (lobby.notEnrolled) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {status.exam_title}
        </h1>
        <p className="mt-4 text-sm text-gray-600 dark:text-slate-400">
          Sınav salonuna girmek için önce bu sınava kaydolmalısın.
        </p>
        <Link
          to={routes.denemeler}
          className="mt-6 inline-flex rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          Denemelere git ve kaydol
        </Link>
      </div>
    )
  }

  const startTime = status.scheduled_start_at
    ? formatIstanbulDateTimeShort(status.scheduled_start_at)
    : null

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8.5rem)]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            to={routes.denemeler}
            className="text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            ← Denemeler
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-slate-100">
            {status.exam_title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {startTime && <>Başlangıç {startTime}</>}
            {status.duration_minutes ? ` · ${status.duration_minutes} dk` : ''}
          </p>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-gray-900 px-5 py-3 text-white shadow-lg dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
          {starting ? (
            <p className="text-sm font-medium">Sınav açılıyor…</p>
          ) : showCountdown ? (
            <>
              <p className="text-xs leading-tight text-gray-400">
                Sınavın
                <br />
                başlamasına
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                {formatCountdown(countdownSeconds)}
              </p>
            </>
          ) : status.can_start_exam ? (
            <p className="text-sm font-medium">Sınav başlıyor…</p>
          ) : (
            <p className="text-sm">Giriş süresi sona erdi.</p>
          )}
        </div>
      </header>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative min-h-0 flex-1">
            {lobby.state ? (
              <ExamHall
                me={lobby.state.me}
                participants={lobby.state.participants}
                online={lobby.online}
                enrolledCount={lobby.state.enrolled_count}
                boardText={startTime ? `Sınav ${startTime.slice(-5)}'de başlıyor · Başarılar!` : 'Başarılar!'}
              />
            ) : (
              <div className="flex h-full min-h-[18rem] items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900">
                Salon hazırlanıyor…
              </div>
            )}
            {joinToast && (
              <p
                role="status"
                className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gray-900/90 px-4 py-1.5 text-sm text-white shadow-lg"
              >
                <span className="font-semibold">{joinToast}</span> salona girdi
              </p>
            )}
          </div>

          <details className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer font-medium text-gray-900 dark:text-slate-100">
              Sınav kuralları
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-600 dark:text-slate-400">
              {EXAM_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </details>
        </div>

        {lobby.state && (
          <LobbyChat
            me={lobby.state.me}
            feed={lobby.feed}
            chatOpen={lobby.state.chat_open && showCountdown}
            connected={lobby.connected}
            onSend={lobby.send}
          />
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
