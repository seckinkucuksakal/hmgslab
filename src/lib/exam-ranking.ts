import { supabase } from './supabase'
import type { AttemptRanking, ExamLeaderboard } from '../types/exam-ranking'

export async function getAttemptRanking(
  attemptId: string,
): Promise<AttemptRanking> {
  const { data, error } = await supabase.rpc('get_attempt_ranking', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptRanking
}

export async function getExamLeaderboard(
  examId: string,
  limit = 50,
): Promise<ExamLeaderboard> {
  const { data, error } = await supabase.rpc('get_exam_leaderboard', {
    p_exam_id: examId,
    p_limit: limit,
  })

  if (error) throw error
  return data as ExamLeaderboard
}

export function getRankingErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('bulunamadı')) return message
    if (message.includes('sıralamaya dahil değil')) return message
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
  }

  return 'Sıralama yüklenemedi. Lütfen tekrar deneyin.'
}
