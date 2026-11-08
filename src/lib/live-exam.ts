import { ACCESS_REQUIRED_MESSAGE, isAccessError } from './access'
import { getEnrollmentErrorMessage } from './credits'
import { supabase } from './supabase'
import type { ExamLiveStatus, StudentExamListItem } from '../types/live-exam'

export async function getServerTime(): Promise<string> {
  const { data, error } = await supabase.rpc('get_server_time')
  if (error) throw error
  return (data as { server_now: string }).server_now
}

export async function getExamLiveStatus(examId: string): Promise<ExamLiveStatus> {
  const { data, error } = await supabase.rpc('get_exam_live_status', {
    p_exam_id: examId,
  })
  if (error) throw error
  return data as ExamLiveStatus
}

export async function startScheduledExamAttempt(examId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_scheduled_exam_attempt', {
    p_exam_id: examId,
  })
  if (error) throw error
  return data as string
}

export async function istanbulLocalToTimestamptz(
  date: string,
  time: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('istanbul_local_to_timestamptz', {
    p_date: date,
    p_time: time,
  })
  if (error) throw error
  return data as string
}

export async function adminPublishExamResults(examId: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_publish_exam_results', {
    p_exam_id: examId,
  })
  if (error) throw error
  return (data as { results_publish_at: string }).results_publish_at
}

export type UpcomingExamPreview = {
  examId: string
  title: string
  scheduledStartAt: string
  lobbyOpenAt: string
  durationMinutes: number
  questionCount: number
  liveState: 'upcoming' | 'lobby_open' | 'in_progress_entry_open'
  canEnterLobby: boolean
  canEnterExam: boolean
  isEnrolled: boolean
  canEnroll: boolean
  inProgressAttemptId: string | null
  priceKurus: number
  secondsUntilStart: number
  serverNow: string
}

/** All active exams with the caller's attempt state, in one round trip. */
export async function fetchStudentExams(
  _userId?: string,
): Promise<StudentExamListItem[]> {
  const { data, error } = await supabase.rpc('get_student_exam_list')
  if (error) throw error
  return (data ?? []) as StudentExamListItem[]
}

/** Next scheduled exam the user has not finalized (upcoming, lobby open or still enterable). */
export async function fetchNextUpcomingExam(
  _userId?: string,
): Promise<UpcomingExamPreview | null> {
  const exams = await fetchStudentExams()

  for (const exam of exams) {
    if (exam.exam_mode !== 'scheduled' || !exam.scheduled_start_at) continue
    if (exam.finalized_attempt_id || exam.question_count === 0) continue
    if (
      exam.live_state !== 'upcoming' &&
      exam.live_state !== 'lobby_open' &&
      exam.live_state !== 'in_progress_entry_open'
    ) {
      continue
    }

    return {
      examId: exam.id,
      title: exam.title,
      scheduledStartAt: exam.scheduled_start_at,
      lobbyOpenAt: exam.lobby_open_at!,
      durationMinutes: exam.duration_minutes,
      questionCount: exam.question_count,
      liveState: exam.live_state,
      canEnterLobby: exam.can_enter_lobby,
      canEnterExam: exam.can_enter_exam,
      isEnrolled: exam.is_enrolled,
      canEnroll: exam.can_enroll,
      inProgressAttemptId: exam.in_progress_attempt_id,
      priceKurus: exam.price_kurus ?? 14990,
      secondsUntilStart: exam.seconds_until_start ?? 0,
      serverNow: exam.server_now ?? new Date().toISOString(),
    }
  }

  return null
}

export function getLiveExamErrorMessage(error: unknown): string {
  const enrollmentMessage = getEnrollmentErrorMessage(error)
  if (enrollmentMessage) return enrollmentMessage
  if (isAccessError(error)) return ACCESS_REQUIRED_MESSAGE
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('Sınav')) return message
    if (message.includes('lobbi') || message.includes('lobi')) return message
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
    if (message.includes('tamamladınız')) return message
    if (message.includes('giriş süresi')) return message
  }
  return 'Bir hata oluştu. Lütfen tekrar deneyin.'
}
