import { routes } from './routes'

/** Supabase auth e-postalarındaki redirect için kullanılan site kökü. */
export function getSiteOrigin(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  return window.location.origin
}

export function authEmailRedirect(path: string): string {
  return `${getSiteOrigin()}${path}`
}

/** Kayıt doğrulama e-postasında gelen OTP uzunluğu (Supabase confirm signup). */
export const AUTH_SIGNUP_OTP_LENGTH = 8

export const authSignupRedirectTo = authEmailRedirect(routes.kayit)
