const STORAGE_KEY = 'hmgSlab_cookie_notice_acknowledged'
const ACKNOWLEDGED_VALUE = 'true'

export function isCookieNoticeAcknowledged(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === ACKNOWLEDGED_VALUE
  } catch {
    return false
  }
}

export function acknowledgeCookieNotice(): void {
  try {
    localStorage.setItem(STORAGE_KEY, ACKNOWLEDGED_VALUE)
  } catch {
    // Storage unavailable; notice may reappear on next visit.
  }
}

/** Documented consent storage shape — no PII, tokens, or credentials. */
export const COOKIE_NOTICE_STORAGE = {
  key: STORAGE_KEY,
  value: ACKNOWLEDGED_VALUE,
} as const
