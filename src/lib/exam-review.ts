import { supabase } from './supabase'
import type {
  AttemptReview,
  AttemptReviewFull,
  AttemptResultListItem,
} from '../types/exam-review'
import { isReviewEmbargo } from '../types/exam-review'

/** Newest-first page size for the results history list. */
export const ATTEMPT_RESULTS_PAGE_SIZE = 20

export async function fetchAttemptResults(
  _userId: string,
  limit = ATTEMPT_RESULTS_PAGE_SIZE,
): Promise<AttemptResultListItem[]> {
  const { data, error } = await supabase.rpc('get_attempt_results_list', {
    p_limit: limit,
  })

  if (error) throw error
  return (data ?? []) as AttemptResultListItem[]
}

export async function fetchRecentAttemptResults(
  userId: string,
  limit = 3,
): Promise<AttemptResultListItem[]> {
  return fetchAttemptResults(userId, limit)
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

export async function getAttemptReviewFull(
  attemptId: string,
): Promise<AttemptReviewFull> {
  const data = await getAttemptReview(attemptId)
  if (isReviewEmbargo(data)) {
    throw new Error(data.message)
  }
  return data
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
