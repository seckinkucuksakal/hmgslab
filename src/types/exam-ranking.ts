export type AttemptRanking =
  | {
      embargo: true
      results_publish_at: string
    }
  | ({
      embargo?: false
    } & AttemptRankingResult)

export type AttemptRankingResult = {
  exam_id: string
  exam_title: string
  rank: number
  total_participants: number
  top_percent: number | null
  best_attempt_id: string
  is_best_attempt: boolean
}

export type LeaderboardEntry = {
  rank: number
  display_name: string
  is_current_user: boolean
  is_hidden: boolean
  correct_count: number
  incorrect_count: number
  blank_count: number
  submitted_at: string | null
}

export type ExamLeaderboard = {
  exam_id: string
  exam_title: string
  total_participants: number
  limit: number
  entries: LeaderboardEntry[]
  viewer_entry: LeaderboardEntry | null
}

export function formatTopPercent(value: number | null): string | null {
  if (value === null) return null
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function formatParticipantCount(count: number): string {
  return count.toLocaleString('tr-TR')
}
