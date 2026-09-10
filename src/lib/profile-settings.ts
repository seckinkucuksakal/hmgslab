import { supabase } from './supabase'
import { getAuthErrorMessage } from './auth-errors'

export function getProfileSettingsErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message
    if (message.includes('Unauthorized')) {
      return 'Bu işlem için oturum açmanız gerekiyor.'
    }
    if (message.includes('display_name')) {
      return 'Görünen ad en az 2 karakter olmalıdır.'
    }
    return getAuthErrorMessage(error)
  }

  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const trimmed = displayName.trim()

  if (trimmed.length < 2) {
    throw new Error('display_name')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', userId)

  if (profileError) throw profileError

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { display_name: trimmed },
  })

  if (metadataError) throw metadataError
}

export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (verifyError) throw verifyError

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
}
