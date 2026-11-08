/**
 * Upcoming HMGS sessions shown in the header countdown.
 *
 * Dates are APPROXIMATE: they come from the planned 2027 ÖSYM calendar as
 * reported in the press (egitimsistem.com, egitim.net.tr, 2026-11-08), not
 * from an official ÖSYM page. Update this list when ÖSYM confirms the dates.
 */
export const HMGS_SESSIONS = [
  { label: '2027 HMGS/1', date: '2027-04-25' },
  { label: '2027 HMGS/2', date: '2027-09-26' },
] as const

export type HmgsSession = (typeof HMGS_SESSIONS)[number]

/** The next session that has not started yet (exam day counts until it ends). */
export function nextHmgsSession(now: Date): HmgsSession | null {
  return (
    HMGS_SESSIONS.find((s) => new Date(`${s.date}T23:59:59+03:00`).getTime() >= now.getTime()) ??
    null
  )
}

/** Whole days until the exam day (Istanbul calendar days); 0 on exam day. */
export function daysUntilHmgs(session: HmgsSession, now: Date): number {
  const examDay = new Date(`${session.date}T00:00:00+03:00`).getTime()
  const istanbulToday = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)}T00:00:00+03:00`,
  ).getTime()
  return Math.max(0, Math.round((examDay - istanbulToday) / 86_400_000))
}

export type HmgsUrgency = 'green' | 'yellow' | 'orange' | 'red'

/** More than 4 months: green; 2–4 months: yellow; 1–2 months: orange; under a month: red. */
export function hmgsUrgency(days: number): HmgsUrgency {
  if (days > 120) return 'green'
  if (days > 60) return 'yellow'
  if (days > 30) return 'orange'
  return 'red'
}
