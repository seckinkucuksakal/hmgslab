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

export type AttemptReviewEmbargo = {
  embargo: true
  results_publish_at: string
  exam_title: string
  attempt_id: string
  status: 'submitted' | 'expired'
  submitted_at: string | null
  message: string
}

export type AttemptReviewFull = {
  embargo: false
  attempt: AttemptReviewSummary
  subjects: SubjectPerformance[]
  questions: ReviewQuestion[]
}

export type AttemptReview = AttemptReviewEmbargo | AttemptReviewFull

export type AttemptResultListItemPublished = {
  id: string
  exam_title: string
  submitted_at: string | null
  status: 'submitted' | 'expired'
  embargo: false
  results_publish_at?: string | null
  correct_count: number
  incorrect_count: number
  blank_count: number
  total_questions: number
  completion_percent: number
}

export type AttemptResultListItemEmbargo = {
  id: string
  exam_title: string
  submitted_at: string | null
  status: 'submitted' | 'expired'
  embargo: true
  results_publish_at: string
  correct_count: null
  incorrect_count: null
  blank_count: null
  total_questions: number
  completion_percent: null
}

export type AttemptResultListItem =
  | AttemptResultListItemPublished
  | AttemptResultListItemEmbargo

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

import { computeExamScore } from '../lib/exam-score'

export function getCompletionPercent(
  correct: number,
  total: number,
): number {
  return computeExamScore(correct, total)
}

export function isReviewEmbargo(
  review: AttemptReview,
): review is AttemptReviewEmbargo {
  return 'embargo' in review && review.embargo === true
}

export function isResultEmbargo(
  item: AttemptResultListItem,
): item is AttemptResultListItemEmbargo {
  return item.embargo === true
}
