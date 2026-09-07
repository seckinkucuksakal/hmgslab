export const ISTANBUL_TZ = 'Europe/Istanbul'

/** Format an ISO timestamp for HMGSlab display (Europe/Istanbul). */
export function formatIstanbulDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatIstanbulTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d)
}

export function formatIstanbulDateTime(iso: string | Date): string {
  return `${formatIstanbulDate(iso)} • ${formatIstanbulTime(iso)}`
}

export function formatIstanbulDateTimeShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ISTANBUL_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = s % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export type CountdownParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function getCountdownParts(totalSeconds: number): CountdownParts {
  const s = Math.max(0, Math.floor(totalSeconds))
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}
