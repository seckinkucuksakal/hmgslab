import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useServerCountdown } from '../../hooks/useServerClock'
import {
  fetchNextUpcomingExam,
  type UpcomingExamPreview,
} from '../../lib/live-exam'
import {
  CREDITS_CHANGED_EVENT,
  enrollInExam,
  getMyCredits,
  notifyCreditsChanged,
} from '../../lib/credits'
import { getExamErrorMessage } from '../../lib/exam-session'
import {
  formatIstanbulDateTimeShort,
  formatIstanbulTime,
  getCountdownParts,
} from '../../lib/istanbul-time'
import { routes } from '../../lib/routes'
import { useConfirm } from '../../hooks/useConfirm'

const POLL_MS = 30_000

function CountdownUnit({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-gray-200/80 bg-white shadow-sm sm:h-20 sm:w-20 dark:border-slate-700 dark:bg-slate-900">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-gray-900 sm:text-4xl dark:text-slate-100">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  )
}

type UpcomingExamCountdownProps = {
  userId: string
}

export function UpcomingExamCountdown({ userId }: UpcomingExamCountdownProps) {
  const [exam, setExam] = useState<UpcomingExamPreview | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  const load = useCallback(async () => {
    try {
      const [next, credits] = await Promise.all([
        fetchNextUpcomingExam(userId),
        getMyCredits(),
      ])
      setExam(next)
      setBalance(credits.balance)
    } catch {
      setExam(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => {
      void load()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onChanged = () => void load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CREDITS_CHANGED_EVENT, onChanged)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CREDITS_CHANGED_EVENT, onChanged)
    }
  }, [load])

  // Reload exactly when the lobby opens, not up to POLL_MS later.
  useEffect(() => {
    if (!exam || exam.liveState !== 'upcoming') return
    const msUntilLobby = new Date(exam.lobbyOpenAt).getTime() - new Date(exam.serverNow).getTime()
    if (msUntilLobby <= 0 || msUntilLobby > POLL_MS) return
    const timer = window.setTimeout(() => void load(), msUntilLobby + 500)
    return () => window.clearTimeout(timer)
  }, [exam, load])

  const handleEnroll = async () => {
    if (!exam) return
    const confirmed = await confirm({
      title: 'Canlı sınava kaydol',
      message: (
        <>
          <span className="font-medium text-gray-900 dark:text-slate-100">{exam.title}</span>
          {' için kaydın 1 deneme hakkı kullanır. Sınava katılmazsan hakkın giriş süresi bitince iade edilir.'}
        </>
      ),
      details:
        balance !== null
          ? [
              { label: 'Kullanılacak hak', value: 1 },
              { label: 'Kayıttan sonra kalan', value: balance - 1 },
            ]
          : undefined,
      confirmLabel: 'Kaydol',
    })
    if (!confirmed) return

    setEnrolling(true)
    setError(null)
    try {
      await enrollInExam(exam.examId)
      notifyCreditsChanged()
      await load()
    } catch (err) {
      setError(getExamErrorMessage(err))
    } finally {
      setEnrolling(false)
    }
  }

  const countdownSeconds = useServerCountdown(
    exam?.secondsUntilStart,
    exam ? `${exam.examId}-${exam.serverNow}` : '',
  )

  useEffect(() => {
    if (countdownSeconds === 0 && exam) {
      void load()
    }
  }, [countdownSeconds, exam, load])

  if (loading) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center">
        <p className="text-sm text-gray-500">Yükleniyor…</p>
      </div>
    )
  }

  if (!exam) return null

  const started = exam.liveState === 'in_progress_entry_open'
  const lobbyPath = routes.denemeLobi(exam.examId)
  const buttonClass =
    'mt-6 inline-flex rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500'

  const renderAction = () => {
    if (exam.inProgressAttemptId) {
      return (
        <Link to={routes.sinav(exam.inProgressAttemptId)} className={buttonClass}>
          Sınava dön
        </Link>
      )
    }

    if (exam.isEnrolled) {
      if (started && exam.canEnterExam) {
        return (
          <Link to={lobbyPath} className={buttonClass}>
            Sınava gir
          </Link>
        )
      }
      if (exam.canEnterLobby) {
        return (
          <Link to={lobbyPath} className={buttonClass}>
            Giriş alanına git
          </Link>
        )
      }
      return (
        <p className="mt-6 text-sm font-medium text-green-700 dark:text-green-400">
          Kaydın tamam · giriş alanı {formatIstanbulTime(exam.lobbyOpenAt)}'de açılır
        </p>
      )
    }

    if (!exam.canEnroll) return null

    if (balance !== null && balance < 1) {
      return (
        <Link
          to={routes.paketler}
          className="mt-6 inline-flex rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          Hak satın al
        </Link>
      )
    }

    return (
      <button
        type="button"
        disabled={enrolling || balance === null}
        onClick={() => void handleEnroll()}
        className={buttonClass}
      >
        {enrolling ? 'Kaydediliyor…' : 'Kaydol (1 hak)'}
      </button>
    )
  }

  const parts = getCountdownParts(countdownSeconds)
  const units: { label: string; value: number }[] =
    parts.days > 0
      ? [
          { label: 'Gün', value: parts.days },
          { label: 'Saat', value: parts.hours },
          { label: 'Dakika', value: parts.minutes },
          { label: 'Saniye', value: parts.seconds },
        ]
      : [
          { label: 'Saat', value: parts.hours },
          { label: 'Dakika', value: parts.minutes },
          { label: 'Saniye', value: parts.seconds },
        ]

  return (
    <section className="flex min-h-[20rem] flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">
        {started
          ? 'Sınav başladı'
          : exam.liveState === 'lobby_open'
            ? 'Giriş alanı açık'
            : 'Yaklaşan deneme'}
      </p>
      <h2 className="mt-3 max-w-lg text-xl font-semibold text-gray-900 sm:text-2xl dark:text-slate-100">
        {exam.title}
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
        {formatIstanbulDateTimeShort(exam.scheduledStartAt)} · {exam.questionCount}{' '}
        soru · {exam.durationMinutes} dk
      </p>

      {started ? (
        <p className="mt-8 text-sm text-gray-600 dark:text-slate-400">
          Geç giriş kısa bir süre daha açık.
        </p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {units.map((unit) => (
              <CountdownUnit key={unit.label} label={unit.label} value={unit.value} />
            ))}
          </div>

          <p className="mt-8 text-sm text-gray-600 dark:text-slate-400">
            Sınav başlamasına kalan süre
          </p>
        </>
      )}

      {renderAction()}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}
