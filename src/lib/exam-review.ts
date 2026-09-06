import { supabase } from './supabase'
import type { AttemptReview, AttemptResultListItem } from '../types/exam-review'
import { getCompletionPercent } from '../types/exam-review'

export async function fetchAttemptResults(
  userId: string,
): Promise<AttemptResultListItem[]> {
  const { data, error } = await supabase
    .from('exam_attempts')
    .select(
      `
      id,
      submitted_at,
      status,
      correct_count,
      incorrect_count,
      blank_count,
      exams(title),
      attempt_questions(count)
    `,
    )
    .eq('user_id', userId)
    .in('status', ['submitted', 'expired'])
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams
    const countEntry = Array.isArray(row.attempt_questions)
      ? row.attempt_questions[0]
      : row.attempt_questions
    const totalQuestions =
      countEntry && typeof countEntry === 'object' && 'count' in countEntry
        ? countEntry.count
        : 0
    const correct = row.correct_count ?? 0

    return {
      id: row.id,
      exam_title: exam?.title ?? 'Deneme',
      submitted_at: row.submitted_at,
      status: row.status as 'submitted' | 'expired',
      correct_count: correct,
      incorrect_count: row.incorrect_count ?? 0,
      blank_count: row.blank_count ?? 0,
      total_questions: totalQuestions,
      completion_percent: getCompletionPercent(correct, totalQuestions),
    }
  })
}

export async function fetchRecentAttemptResults(
  userId: string,
  limit = 3,
): Promise<AttemptResultListItem[]> {
  const results = await fetchAttemptResults(userId)
  return results.slice(0, limit)
}

export async function getAttemptReview(
  attemptId: string,
): Promise<AttemptReview> {
  const { data, error } = await supabase.rpc('get_attempt_review', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptReview
}

export function getReviewErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('Sonuç bulunamadı')) return message
    if (message.includes('incelenemez')) return message
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
  }

  return 'Sonuç yüklenemedi. Lütfen tekrar deneyin.'
}
