import type { ExamMode } from './exam'

export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'expired'

export type ExamAttempt = {
  id: string
  user_id: string
  exam_id: string
  started_at: string
  submitted_at: string | null
  status: ExamAttemptStatus
  duration_minutes_snapshot: number
  score: number | null
  correct_count: number | null
  incorrect_count: number | null
  blank_count: number | null
  created_at: string
}

export type AttemptSync = {
  id: string
  exam_id: string
  exam_title: string
  exam_mode?: ExamMode
  status: ExamAttemptStatus
  started_at: string
  submitted_at: string | null
  duration_minutes_snapshot: number
  scheduled_end_at?: string | null
  results_publish_at?: string | null
  results_available?: boolean
  remaining_seconds: number
  correct_count: number | null
  incorrect_count: number | null
  blank_count: number | null
  total_questions: number
}

export type AttemptSubmitResult = {
  status: ExamAttemptStatus
  exam_mode?: ExamMode
  results_available?: boolean
  results_publish_at?: string | null
  correct_count: number | null
  incorrect_count: number | null
  blank_count: number | null
  total_questions: number
}

export type ActiveExamListItem = {
  id: string
  title: string
  duration_minutes: number
  question_count: number
  in_progress_attempt_id: string | null
}

export type ExamSessionQuestion = {
  id: string
  sort_order: number
  question_text: string
  options: {
    id: string
    option_key: string
    option_text: string
    sort_order: number | null
  }[]
  selected_option_id: string | null
}

export type ExamSession = {
  attempt_id: string
  status: ExamAttemptStatus
  exam_mode: ExamMode
  exam_title: string
  exam_description: string | null
  scheduled_end_at: string | null
  remaining_seconds: number
  questions: ExamSessionQuestion[]
}

export function formatRemainingTime(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function isAttemptReviewable(
  sync: AttemptSync,
  submit?: AttemptSubmitResult,
): boolean {
  const resultsAvailable =
    submit?.results_available ?? sync.results_available ?? true
  return resultsAvailable
}
