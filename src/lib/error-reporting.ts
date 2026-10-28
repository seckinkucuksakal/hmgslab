/**
 * Minimal, privacy-preserving client error reporting.
 *
 * Sends only: a redacted error message, a redacted stack, the route *pattern*
 * (ids replaced), app version and a timestamp. Never sends user ids, emails,
 * display names, tokens, query strings, local/session storage, answers or
 * question content. Disabled unless VITE_ERROR_REPORT_URL is configured; the
 * endpoint (e.g. a log collector or serverless function) is chosen by the
 * operator and is not part of this repository.
 */

const MAX_MESSAGE = 300
const MAX_STACK = 1500
const MAX_REPORTS_PER_SESSION = 20

export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/([?&#][^\s)'"]*)/g, '') // query strings and fragments
    .replace(/\b\d{6,}\b/g, '[num]')
}

/** `/sonuclar/<uuid>` -> `/sonuclar/:id` so reports do not identify attempts/exams. */
export function routePattern(pathname: string): string {
  return pathname
    .split('/')
    .map((part) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(part) || /^\d+$/.test(part) ? ':id' : part,
    )
    .join('/')
}

export type ErrorReport = {
  message: string
  stack: string
  route: string
  version: string
  at: string
}

export function buildReport(error: unknown, pathname: string): ErrorReport {
  const err = error instanceof Error ? error : new Error(String(error))
  return {
    message: redact(err.message).slice(0, MAX_MESSAGE),
    stack: redact(err.stack ?? '').slice(0, MAX_STACK),
    route: routePattern(pathname),
    version: import.meta.env.VITE_APP_VERSION ?? 'dev',
    at: new Date().toISOString(),
  }
}

let sent = 0

export function reportError(error: unknown): void {
  const url = import.meta.env.VITE_ERROR_REPORT_URL
  if (!url || sent >= MAX_REPORTS_PER_SESSION) return
  sent += 1

  try {
    const body = JSON.stringify(buildReport(error, window.location.pathname))
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    } else {
      void fetch(url, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        credentials: 'omit',
      })
    }
  } catch {
    // reporting must never break the app
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason))
}
