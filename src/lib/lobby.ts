import { supabase } from './supabase'

export type LobbyMessage = {
  id: string
  user_id: string
  display_name: string
  body: string
  created_at: string
}

export type LobbyState = {
  me: string
  chat_open: boolean
  enrolled_count: number
  /** user id -> display name (privacy setting applied) for everyone enrolled */
  participants: Record<string, string>
  messages: LobbyMessage[]
}

export const lobbyTopic = (examId: string) => `exam-lobby:${examId}`

export async function getLobbyState(examId: string): Promise<LobbyState> {
  const { data, error } = await supabase.rpc('get_lobby_state', { p_exam_id: examId })
  if (error) throw error
  return data as LobbyState
}

/** The server stores the message with the sender's name and broadcasts it. */
export async function sendLobbyMessage(examId: string, body: string): Promise<LobbyMessage> {
  const { data, error } = await supabase.rpc('send_lobby_message', {
    p_exam_id: examId,
    p_body: body,
  })
  if (error) throw error
  return data as LobbyMessage
}

const knownMessages = [
  'kayıtlı değilsiniz',
  'Sohbet yalnızca',
  'Mesaj boş',
  'en fazla 300',
  'Çok hızlı',
]

export function getLobbyErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (knownMessages.some((m) => message.includes(m))) return message
  }
  return 'Mesaj gönderilemedi. Lütfen tekrar deneyin.'
}

export function isNotEnrolledError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'message' in error &&
      String((error as { message: unknown }).message).includes('kayıtlı değilsiniz'),
  )
}

const avatarColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
  'bg-orange-500',
]

/** Stable per-user avatar colour. */
export function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

export function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0).toLocaleUpperCase('tr-TR') : '?'
}
