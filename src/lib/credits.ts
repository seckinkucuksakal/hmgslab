import { supabase } from './supabase'

/**
 * Pricing model: the sign-up gift is one free exam; every further exam is
 * bought on its own (per-exam payment). Internally the free exam and each
 * purchase are a "credit" that enrolling spends, but users never see a
 * credit balance, only "free exam available" or the exam's price.
 */

export type CreditReason =
  | 'signup_bonus'
  | 'purchase'
  | 'admin_grant'
  | 'enrollment'
  | 'refund'

export type CreditHistoryItem = {
  id: string
  delta: number
  reason: CreditReason
  exam_title: string | null
  package_name: string | null
  created_at: string
}

export type MyCredits = {
  /** Free (or already paid, not yet used) exam entries. */
  balance: number
  history: CreditHistoryItem[]
}

export type EnrollResult = {
  enrollment_id: string
  already_enrolled: boolean
  credit_balance: number
}

/** Fired after an action that changes the user's entries, so views can refresh. */
export const CREDITS_CHANGED_EVENT = 'hmgs:credits-changed'

export function notifyCreditsChanged(): void {
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT))
}

export const creditReasonLabels: Record<CreditReason, string> = {
  signup_bonus: 'Ücretsiz ilk deneme',
  purchase: 'Satın alma',
  admin_grant: 'Tanımlanan deneme',
  enrollment: 'Denemeye kayıt',
  refund: 'İade (katılım olmadı)',
}

/** The server owns the balance; this only reports it. */
export async function getMyCredits(): Promise<MyCredits> {
  const { data, error } = await supabase.rpc('get_my_credits')
  if (error) throw error
  return data as MyCredits
}

/** Uses a free / already paid entry, unless the user is already enrolled. */
export async function enrollInExam(examId: string): Promise<EnrollResult> {
  const { data, error } = await supabase.rpc('enroll_in_exam', { p_exam_id: examId })
  if (error) throw error
  return data as EnrollResult
}

export type ExamOrder = {
  id: string
  exam_id: string
  amount_kurus: number
  currency: 'TRY'
  status: 'pending' | 'paid' | 'canceled' | 'failed'
}

/**
 * Opens (or reuses) a pending order for one exam. Paying it enrolls the user
 * on the server. Call this only when a real payment starts.
 */
export async function createExamOrder(examId: string): Promise<ExamOrder> {
  const { data, error } = await supabase.rpc('create_exam_order', { p_exam_id: examId })
  if (error) throw error
  return data as ExamOrder
}

const enrollmentMessages = [
  'kayıtlı değilsiniz',
  'kayıt süresi sona erdi',
  'zaten kayıtlısınız',
]

export function getEnrollmentErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null
  const message = String((error as { message: unknown }).message)
  if (message.includes('Yetersiz deneme hakkı')) {
    return 'Bu deneme için ödeme yapmanız gerekiyor.'
  }
  if (enrollmentMessages.some((m) => message.includes(m))) return message
  return null
}

const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
})

/** Amounts are stored in kuruş on the server. */
export function formatTry(kurus: number): string {
  return tryFormatter.format(kurus / 100)
}
