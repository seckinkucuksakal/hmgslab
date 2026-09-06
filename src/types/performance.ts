export type PerformanceTrend = 'improving' | 'stable' | 'declining' | null

export type PerformanceOverview = {
  completed_exams: number
  average_correct_percent: number
  best_correct_percent: number
  best_exam_title: string
  trend: PerformanceTrend
  trend_label: string | null
  recent_avg_percent: number | null
  previous_avg_percent: number | null
}

export type RecentExamPerformance = {
  attempt_id: string
  exam_id: string
  exam_title: string
  submitted_at: string | null
  correct_count: number
  incorrect_count: number
  blank_count: number
  total_questions: number
  correct_percent: number
}

export type SubjectPerformanceStat = {
  subject_id: string
  subject_name: string
  total: number
  answered: number
  correct: number
  incorrect: number
  blank: number
  correct_percent: number
}

export type SubjectHighlight = {
  subject_id: string
  subject_name: string
  correct_percent: number
  answered: number
}

export type TopicPerformanceStat = {
  topic_id: string
  topic_name: string
  subject_id: string
  subject_name: string
  total: number
  answered: number
  correct: number
  incorrect: number
  blank: number
  correct_percent: number
}

export type UserPerformanceAnalytics = {
  has_data: boolean
  overview: PerformanceOverview | null
  recent_exams: RecentExamPerformance[]
  subjects: SubjectPerformanceStat[]
  topics: TopicPerformanceStat[]
  strongest_subject: SubjectHighlight | null
  weakest_subject: SubjectHighlight | null
  is_limited_data: boolean
  subject_min_answered: number
  trend_threshold: number
}

export function formatPercent(value: number): string {
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}
