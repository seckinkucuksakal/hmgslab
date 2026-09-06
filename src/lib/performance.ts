import { supabase } from './supabase'
import type { UserPerformanceAnalytics } from '../types/performance'

export async function getUserPerformanceAnalytics(): Promise<UserPerformanceAnalytics> {
  const { data, error } = await supabase.rpc('get_user_performance_analytics')

  if (error) throw error
  return data as UserPerformanceAnalytics
}

export function getPerformanceErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
  }

  return 'Performans verileri yüklenemedi. Lütfen tekrar deneyin.'
}

export function getRecentAverageCorrectPercent(
  analytics: UserPerformanceAnalytics,
  count = 3,
): number | null {
  if (!analytics.has_data || analytics.recent_exams.length === 0) return null

  const slice = analytics.recent_exams.slice(0, count)
  if (slice.length === 0) return null

  const sum = slice.reduce((acc, exam) => acc + exam.correct_percent, 0)
  return Math.round((sum / slice.length) * 10) / 10
}
