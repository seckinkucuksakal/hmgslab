import { supabase } from './supabase'

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
  balance: number
  history: CreditHistoryItem[]
}

export type EnrollResult = {
  enrollment_id: string
  already_enrolled: boolean
  credit_balance: number
}

export const creditReasonLabels: Record<CreditReason, string> = {
  signup_bonus: 'Kayıt hediyesi',
  purchase: 'Satın alma',
  admin_grant: 'Tanımlanan paket',
  enrollment: 'Denemeye kayıt',
  refund: 'İade (katılım olmadı)',
}

/** The server owns the balance; this only reports it. */
export async function getMyCredits(): Promise<MyCredits> {
  const { data, error } = await supabase.rpc('get_my_credits')
  if (error) throw error
  return data as MyCredits
}

/** Spends one credit, unless the user is already enrolled in this exam. */
export async function enrollInExam(examId: string): Promise<EnrollResult> {
  const { data, error } = await supabase.rpc('enroll_in_exam', { p_exam_id: examId })
  if (error) throw error
  return data as EnrollResult
}

const enrollmentMessages = [
  'Yetersiz deneme hakkı',
  'kayıtlı değilsiniz',
  'kayıt süresi sona erdi',
]

export function getEnrollmentErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null
  const message = String((error as { message: unknown }).message)
  if (message.includes('Yetersiz deneme hakkı')) {
    return 'Deneme hakkınız kalmadı. Yeni bir deneme için paket almanız gerekiyor.'
  }
  if (enrollmentMessages.some((m) => message.includes(m))) return message
  return null
}
