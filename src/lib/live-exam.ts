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
  liveState: 'upcoming' | 'lobby_open'
  canEnterLobby: boolean
  secondsUntilStart: number
  serverNow: string
}

/** Next scheduled exam the user has not finalized (upcoming or lobby open). */
export async function fetchNextUpcomingExam(
  userId: string,
): Promise<UpcomingExamPreview | null> {
  const [examsResult, attemptsResult] = await Promise.all([
    supabase
      .from('exams')
      .select(
        'id, title, duration_minutes, scheduled_start_at, lobby_open_at, exam_questions(count)',
      )
      .eq('is_active', true)
      .eq('exam_mode', 'scheduled')
      .not('scheduled_start_at', 'is', null)
      .order('scheduled_start_at', { ascending: true }),
    supabase
      .from('exam_attempts')
      .select('exam_id')
      .eq('user_id', userId)
      .in('status', ['submitted', 'expired']),
  ])

  if (examsResult.error) throw examsResult.error
  if (attemptsResult.error) throw attemptsResult.error

  const finalized = new Set((attemptsResult.data ?? []).map((row) => row.exam_id))

  for (const exam of examsResult.data ?? []) {
    if (finalized.has(exam.id)) continue

    const status = await getExamLiveStatus(exam.id)
    if (
      status.exam_state !== 'upcoming' &&
      status.exam_state !== 'lobby_open'
    ) {
      continue
    }

    const countEntry = Array.isArray(exam.exam_questions)
      ? exam.exam_questions[0]
      : exam.exam_questions
    const questionCount =
      countEntry && typeof countEntry === 'object' && 'count' in countEntry
        ? countEntry.count
        : 0

    if (questionCount === 0) continue

    return {
      examId: exam.id,
      title: exam.title,
      scheduledStartAt: exam.scheduled_start_at!,
      lobbyOpenAt: exam.lobby_open_at!,
      durationMinutes: exam.duration_minutes,
      questionCount,
      liveState: status.exam_state as 'upcoming' | 'lobby_open',
      canEnterLobby: status.can_enter_lobby,
      secondsUntilStart: status.seconds_until_start ?? 0,
      serverNow: status.server_now,
    }
  }

  return null
}

/** Lists active exams with per-user live status from the database. */
export async function fetchStudentExams(
  userId: string,
): Promise<StudentExamListItem[]> {
  const [examsResult, attemptsResult] = await Promise.all([
    supabase
      .from('exams')
      .select(
        'id, title, description, duration_minutes, exam_mode, scheduled_start_at, lobby_open_at, scheduled_end_at, results_publish_at, exam_questions(count)',
      )
      .eq('is_active', true)
      .order('scheduled_start_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false }),
    supabase
      .from('exam_attempts')
      .select('id, exam_id, status')
      .eq('user_id', userId),
  ])

  if (examsResult.error) throw examsResult.error
  if (attemptsResult.error) throw attemptsResult.error

  const inProgressByExam = new Map<string, string>()
  const finalizedByExam = new Map<string, string>()
  for (const row of attemptsResult.data ?? []) {
    if (row.status === 'in_progress') {
      inProgressByExam.set(row.exam_id, row.id)
    } else if (row.status === 'submitted' || row.status === 'expired') {
      finalizedByExam.set(row.exam_id, row.id)
    }
  }

  const items: StudentExamListItem[] = []

  for (const exam of examsResult.data ?? []) {
    const countEntry = Array.isArray(exam.exam_questions)
      ? exam.exam_questions[0]
      : exam.exam_questions
    const questionCount =
      countEntry && typeof countEntry === 'object' && 'count' in countEntry
        ? countEntry.count
        : 0

    if (exam.exam_mode === 'practice') {
      items.push({
        id: exam.id,
        title: exam.title,
        description: exam.description,
        duration_minutes: exam.duration_minutes,
        question_count: questionCount,
        exam_mode: 'practice',
        scheduled_start_at: null,
        lobby_open_at: null,
        scheduled_end_at: null,
        results_publish_at: null,
        in_progress_attempt_id: inProgressByExam.get(exam.id) ?? null,
        finalized_attempt_id: finalizedByExam.get(exam.id) ?? null,
        live_state: 'practice',
        can_enter_lobby: false,
        can_enter_exam: true,
        results_available: true,
      })
      continue
    }

    const status = await getExamLiveStatus(exam.id)
    items.push({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      duration_minutes: exam.duration_minutes,
      question_count: questionCount,
      exam_mode: 'scheduled',
      scheduled_start_at: exam.scheduled_start_at,
      lobby_open_at: exam.lobby_open_at,
      scheduled_end_at: exam.scheduled_end_at,
      results_publish_at: exam.results_publish_at,
      in_progress_attempt_id: status.user_attempt_id ?? null,
      finalized_attempt_id: finalizedByExam.get(exam.id) ?? null,
      live_state: status.exam_state,
      can_enter_lobby: status.can_enter_lobby,
      can_enter_exam: status.can_enter_exam,
      results_available: status.results_available,
    })
  }

  return items
}

export function getLiveExamErrorMessage(error: unknown): string {
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
