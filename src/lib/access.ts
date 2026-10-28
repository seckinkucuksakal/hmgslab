import { supabase } from './supabase'

export type AccessStatus = 'free' | 'active' | 'canceled' | 'expired'

export type MyAccess = {
  enforced: boolean
  status: AccessStatus
  plan_id: string | null
  plan_name: string | null
  starts_at: string | null
  ends_at: string | null
  free_exam_limit: number
  free_exams_used: number
  history_locked: boolean
  can_start_new: boolean
}

/** The server decides access; this only reports it. */
export async function getMyAccess(): Promise<MyAccess> {
  const { data, error } = await supabase.rpc('get_my_access')
  if (error) throw error
  return data as MyAccess
}

export const ACCESS_REQUIRED_MESSAGE =
  'Bu işlem için aktif paket gerekiyor. Paket durumunuzu Profil sayfasından görebilirsiniz.'

export function isAccessError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'message' in error &&
      String((error as { message: unknown }).message).includes('aktif paket'),
  )
}
