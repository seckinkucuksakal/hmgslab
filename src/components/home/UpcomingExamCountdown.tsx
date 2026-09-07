import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useServerCountdown } from '../../hooks/useServerClock'
import {
  fetchNextUpcomingExam,
  type UpcomingExamPreview,
} from '../../lib/live-exam'
import {
  formatIstanbulDateTimeShort,
  getCountdownParts,
} from '../../lib/istanbul-time'

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
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const next = await fetchNextUpcomingExam(userId)
      setExam(next)
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
    return () => window.clearInterval(interval)
  }, [load])

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
        {exam.liveState === 'lobby_open' ? 'Giriş alanı açık' : 'Yaklaşan deneme'}
      </p>
      <h2 className="mt-3 max-w-lg text-xl font-semibold text-gray-900 sm:text-2xl dark:text-slate-100">
        {exam.title}
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
        {formatIstanbulDateTimeShort(exam.scheduledStartAt)} · {exam.questionCount}{' '}
        soru · {exam.durationMinutes} dk
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {units.map((unit) => (
          <CountdownUnit key={unit.label} label={unit.label} value={unit.value} />
        ))}
      </div>

      <p className="mt-8 text-sm text-gray-600 dark:text-slate-400">
        Sınav başlamasına kalan süre
      </p>

      {exam.canEnterLobby && (
        <Link
          to={`/denemeler/${exam.examId}/lobi`}
          className="mt-6 inline-flex rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          Giriş alanına git
        </Link>
      )}
    </section>
  )
}
