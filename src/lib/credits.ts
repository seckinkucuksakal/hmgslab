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

/** Fired after an action that changes the balance, so the header can refresh. */
export const CREDITS_CHANGED_EVENT = 'hmgs:credits-changed'

export function notifyCreditsChanged(): void {
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT))
}

export const creditReasonLabels: Record<CreditReason, string> = {
  signup_bonus: 'Kayıt hediyesi',
  purchase: 'Satın alma',
  admin_grant: 'Tanımlanan hak',
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
    return 'Deneme hakkınız kalmadı. Yeni bir deneme için Paketler sayfasından hak satın alabilirsiniz.'
  }
  if (enrollmentMessages.some((m) => message.includes(m))) return message
  return null
}

export type CreditPackage = {
  id: string
  name: string
  credits: number
  price_kurus: number
  currency: 'TRY'
}

export type CreditOrderStatus = 'pending' | 'paid' | 'canceled' | 'failed'

export type CreditOrder = {
  id: string
  package_id: string
  package_name: string | null
  credits: number
  amount_kurus: number
  currency: 'TRY'
  status: CreditOrderStatus
  created_at: string
  paid_at: string | null
}

export const creditOrderStatusLabels: Record<CreditOrderStatus, string> = {
  pending: 'Ödeme bekleniyor',
  paid: 'Ödendi',
  canceled: 'İptal edildi',
  failed: 'Ödeme başarısız',
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

export async function getCreditPackages(): Promise<CreditPackage[]> {
  const { data, error } = await supabase
    .from('credit_packages')
    .select('id, name, credits, price_kurus, currency')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data as CreditPackage[]
}

/** Creates (or reuses) a pending order; credits are granted only once it is paid. */
export async function createCreditOrder(packageId: string): Promise<CreditOrder> {
  const { data, error } = await supabase.rpc('create_credit_order', {
    p_package_id: packageId,
  })
  if (error) throw error
  return data as CreditOrder
}

export async function cancelCreditOrder(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_credit_order', { p_order_id: orderId })
  if (error) throw error
}

export async function getMyCreditOrders(): Promise<CreditOrder[]> {
  const { data, error } = await supabase.rpc('get_my_credit_orders')
  if (error) throw error
  return data as CreditOrder[]
}
