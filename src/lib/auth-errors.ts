import type { AuthError } from '@supabase/supabase-js'

const FALLBACK = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'

/**
 * Supabase returns English messages that sometimes name internal endpoints, so
 * they are never rendered directly. Error codes are matched first because they
 * are stable; message matching only covers cases with no code.
 */
const messagesByCode: Record<string, string> = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed:
    'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzu kontrol edin.',
  email_exists: 'Bu e-posta adresi zaten kayıtlı.',
  user_already_exists: 'Bu e-posta adresi zaten kayıtlı.',
  weak_password: 'Şifre çok zayıf. En az 8 karakter kullanın.',
  same_password: 'Yeni şifre eskisiyle aynı olamaz.',
  otp_expired: 'Bağlantının süresi dolmuş. Yeni bir bağlantı isteyin.',
  over_email_send_rate_limit:
    'Çok fazla e-posta talebi gönderildi. Lütfen birkaç dakika bekleyin.',
  over_request_rate_limit:
    'Çok fazla deneme yapıldı. Lütfen birkaç dakika bekleyin.',
  validation_failed: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.',
  signup_disabled: 'Yeni kayıtlar şu anda kapalı.',
  session_not_found: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
  user_not_found: 'Kullanıcı bulunamadı.',
}

const messagePatterns: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-posta veya şifre hatalı.'],
  [
    /email not confirmed/i,
    'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzu kontrol edin.',
  ],
  [/already registered|already been registered/i, 'Bu e-posta adresi zaten kayıtlı.'],
  [/password should be at least/i, 'Şifre en az 8 karakter olmalıdır.'],
  [
    /unable to validate email|invalid email/i,
    'Geçerli bir e-posta adresi girin.',
  ],
  [
    /rate limit|you can only request this after/i,
    'Çok fazla deneme yapıldı. Lütfen birkaç dakika bekleyin.',
  ],
  [
    /token has expired|invalid token|expired/i,
    'Bağlantının süresi dolmuş. Yeni bir bağlantı isteyin.',
  ],
  [
    /failed to fetch|network|networkerror/i,
    'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.',
  ],
]

export function getAuthErrorMessage(error: AuthError | Error | null): string {
  if (!error) return FALLBACK

  if (import.meta.env.DEV) {
    console.error('[auth]', error)
  }

  const code = (error as AuthError).code
  if (code && messagesByCode[code]) {
    return messagesByCode[code]
  }

  for (const [pattern, message] of messagePatterns) {
    if (pattern.test(error.message)) return message
  }

  return FALLBACK
}
