import { supabase } from './supabase'
import type {
  AttemptSubmitResult,
  AttemptSync,
  ExamSession,
  ExamSessionQuestion,
} from '../types/exam-attempt'

export async function startExamAttempt(examId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_exam_attempt', {
    p_exam_id: examId,
  })

  if (error) throw error
  return data as string
}

export async function syncExamAttempt(attemptId: string): Promise<AttemptSync> {
  const { data, error } = await supabase.rpc('sync_exam_attempt', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptSync
}

export async function saveAttemptAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('save_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_option_id: selectedOptionId,
  })

  if (error) throw error
}

export async function submitExamAttempt(
  attemptId: string,
): Promise<AttemptSubmitResult> {
  const { data, error } = await supabase.rpc('submit_exam_attempt', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptSubmitResult
}

export async function fetchActiveExams(
  userId: string,
): Promise<
  import('../types/exam-attempt').ActiveExamListItem[]
> {
  const [examsResult, attemptsResult] = await Promise.all([
    supabase
      .from('exams')
      .select('id, title, duration_minutes, exam_questions(count)')
      .eq('is_active', true)
      .eq('exam_mode', 'practice')
      .order('updated_at', { ascending: false }),
    supabase
      .from('exam_attempts')
      .select('id, exam_id')
      .eq('user_id', userId)
      .eq('status', 'in_progress'),
  ])

  if (examsResult.error) throw examsResult.error
  if (attemptsResult.error) throw attemptsResult.error

  const inProgressByExam = new Map(
    (attemptsResult.data ?? []).map((row) => [row.exam_id, row.id]),
  )

  return (examsResult.data ?? []).map((exam) => {
    const countEntry = Array.isArray(exam.exam_questions)
      ? exam.exam_questions[0]
      : exam.exam_questions
    const questionCount =
      countEntry && typeof countEntry === 'object' && 'count' in countEntry
        ? countEntry.count
        : 0

    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      question_count: questionCount,
      in_progress_attempt_id: inProgressByExam.get(exam.id) ?? null,
    }
  })
}

/**
 * Loads the active exam session in a single call. The RPC is the only path
 * students have to question text and options; it never returns is_correct or
 * explanation data.
 */
export async function loadExamSession(
  attemptId: string,
): Promise<ExamSession> {
  const { data, error } = await supabase.rpc('get_exam_session', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as ExamSession
}

export async function loadExamSessionQuestions(
  attemptId: string,
): Promise<ExamSessionQuestion[]> {
  const session = await loadExamSession(attemptId)
  return session.questions
}

export function getPostSubmitPath(
  attemptId: string,
  result: AttemptSubmitResult | AttemptSync,
): string {
  const resultsAvailable = result.results_available ?? true
  if (result.exam_mode === 'scheduled' && !resultsAvailable) {
    return `/sinav/${attemptId}/tamamlandi`
  }
  return `/sonuclar/${attemptId}`
}

export function getExamErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('Deneme') || message.includes('Sınav')) return message
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
    if (message.includes('düzenlenemez')) return 'Deneme artık düzenlenemez.'
    if (message.includes('tamamlanmış')) return 'Deneme zaten tamamlanmış.'
    if (message.includes('giriş süresi')) return message
    if (message.includes('henüz başlamadı')) return message
    if (message.includes('süresi doldu')) return message
  }

  return 'Bir hata oluştu. Lütfen tekrar deneyin.'
}
