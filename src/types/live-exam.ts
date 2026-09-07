export type ExamMode = 'practice' | 'scheduled'

export type LiveExamState =
  | 'practice'
  | 'upcoming'
  | 'lobby_open'
  | 'in_progress_entry_open'
  | 'in_progress_entry_closed'
  | 'results_pending'
  | 'results_published'

export type ExamLiveStatus = {
  server_now: string
  exam_mode: ExamMode
  exam_state: LiveExamState
  exam_id: string
  exam_title: string
  exam_description: string | null
  duration_minutes: number
  scheduled_start_at?: string | null
  lobby_open_at?: string | null
  late_entry_until?: string | null
  scheduled_end_at?: string | null
  results_publish_at?: string | null
  seconds_until_start?: number
  seconds_until_results?: number
  can_enter_lobby: boolean
  can_start_exam: boolean
  can_enter_exam: boolean
  can_submit: boolean
  results_available: boolean
  user_attempt_id?: string | null
  user_attempt_status?: string | null
  user_has_finalized_attempt?: boolean
}

export type StudentExamListItem = {
  id: string
  title: string
  description: string | null
  duration_minutes: number
  question_count: number
  exam_mode: ExamMode
  scheduled_start_at: string | null
  lobby_open_at: string | null
  scheduled_end_at: string | null
  results_publish_at: string | null
  in_progress_attempt_id: string | null
  finalized_attempt_id: string | null
  live_state: LiveExamState
  can_enter_lobby: boolean
  can_enter_exam: boolean
  results_available: boolean
}

export const liveExamStateLabels: Record<LiveExamState, string> = {
  practice: 'Serbest',
  upcoming: 'Yaklaşan',
  lobby_open: 'Giriş Açıldı',
  in_progress_entry_open: 'Devam Ediyor',
  in_progress_entry_closed: 'Giriş Kapandı',
  results_pending: 'Sonuç Bekleniyor',
  results_published: 'Sonuçlar Açıklandı',
}
