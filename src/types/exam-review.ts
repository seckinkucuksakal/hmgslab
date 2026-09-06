export type ReviewQuestionStatus = 'correct' | 'incorrect' | 'blank'

export type ReviewFilter = 'all' | 'correct' | 'incorrect' | 'blank'

export type ReviewOption = {
  id: string
  option_key: string
  option_text: string
  sort_order: number | null
}

export type ReviewQuestion = {
  question_id: string
  sort_order: number
  question_text: string
  explanation: string | null
  subject_id: string | null
  subject_name: string | null
  options: ReviewOption[]
  selected_option_id: string | null
  correct_option_id: string | null
  status: ReviewQuestionStatus
}

export type SubjectPerformance = {
  subject_id: string
  subject_name: string
  total: number
  correct: number
  incorrect: number
  blank: number
  percent_correct: number
}

export type AttemptReviewSummary = {
  id: string
  exam_id: string
  exam_title: string
  status: 'submitted' | 'expired'
  submitted_at: string | null
  correct_count: number
  incorrect_count: number
  blank_count: number
  total_questions: number
}

export type AttemptReview = {
  attempt: AttemptReviewSummary
  subjects: SubjectPerformance[]
  questions: ReviewQuestion[]
}

export type AttemptResultListItem = {
  id: string
  exam_title: string
  submitted_at: string | null
  status: 'submitted' | 'expired'
  correct_count: number
  incorrect_count: number
  blank_count: number
  total_questions: number
  completion_percent: number
}

export const reviewStatusLabels: Record<ReviewQuestionStatus, string> = {
  correct: 'Doğru',
  incorrect: 'Yanlış',
  blank: 'Boş',
}

export const reviewFilterLabels: Record<ReviewFilter, string> = {
  all: 'Tümü',
  correct: 'Doğrular',
  incorrect: 'Yanlışlar',
  blank: 'Boşlar',
}

export function getCompletionPercent(
  correct: number,
  total: number,
): number {
  if (total === 0) return 0
  return Math.round((correct / total) * 100)
}
