import { useServerClock } from '../../hooks/useServerClock'
import { formatIstanbulDate } from '../../lib/istanbul-time'
import { daysUntilHmgs, hmgsUrgency, nextHmgsSession, type HmgsUrgency } from '../../lib/hmgs'

const urgencyClass: Record<HmgsUrgency, string> = {
  green: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300',
  orange: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
}

const dotClass: Record<HmgsUrgency, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
}

/** "HMGS'ye 168 gün" pill (the date in lib/hmgs.ts is from the planned calendar). */
export function HmgsCountdown() {
  const { serverNow } = useServerClock()
  const now = serverNow ?? new Date()
  const session = nextHmgsSession(now)
  if (!session) return null

  const days = daysUntilHmgs(session, now)
  const urgency = hmgsUrgency(days)
  const dateLabel = formatIstanbulDate(`${session.date}T12:00:00+03:00`)
  const title = `${session.label}: ${dateLabel}`

  return (
    <span
      title={title}
      aria-label={`Bir sonraki HMGS'ye ${days} gün. ${title}`}
      className={[
        'hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold lg:inline-flex',
        urgencyClass[urgency],
      ].join(' ')}
    >
      <span aria-hidden className={['h-2 w-2 rounded-full', dotClass[urgency]].join(' ')} />
      {days === 0 ? 'HMGS bugün' : <>HMGS&apos;ye {days} gün</>}
    </span>
  )
}
