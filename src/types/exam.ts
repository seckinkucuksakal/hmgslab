export type ExamMode = 'practice' | 'scheduled'

export type Exam = {
  id: string
  title: string
  description: string | null
  duration_minutes: number
  is_active: boolean
  exam_mode: ExamMode
  scheduled_start_at: string | null
  lobby_open_at: string | null
  late_entry_until: string | null
  scheduled_end_at: string | null
  results_publish_at: string | null
  lobby_offset_minutes: number
  late_entry_minutes: number
  results_delay_minutes: number
  results_publish_at_override: boolean
  created_at: string
  updated_at: string
}

export type ResultsPublishMode = 'delay' | 'custom'

export type ExamQuestion = {
  id: string
  exam_id: string
  question_id: string
  sort_order: number
  created_at: string
}

export type ExamFormValues = {
  title: string
  description: string
  durationMinutes: number
  isActive: boolean
  examMode: ExamMode
  scheduledDate: string
  scheduledTime: string
  lobbyOffsetMinutes: number
  lateEntryMinutes: number
  resultsDelayMinutes: number
  resultsPublishMode: ResultsPublishMode
  resultsPublishDate: string
  resultsPublishTime: string
}

export type ExamFormErrors = {
  title?: string
  durationMinutes?: string
  questions?: string
  scheduledDate?: string
  scheduledTime?: string
  lobbyOffsetMinutes?: string
  lateEntryMinutes?: string
  resultsDelayMinutes?: string
  resultsPublishDate?: string
  resultsPublishTime?: string
  general?: string
}

export function validateExamForm(
  values: ExamFormValues,
  selectedQuestionIds: string[],
): ExamFormErrors {
  const errors: ExamFormErrors = {}

  if (!values.title.trim()) {
    errors.title = 'Deneme adı gerekli.'
  }

  if (!values.durationMinutes || values.durationMinutes <= 0) {
    errors.durationMinutes = 'Süre pozitif bir sayı olmalıdır.'
  }

  if (selectedQuestionIds.length === 0) {
    errors.questions = 'Denemeye en az bir soru ekleyin.'
  }

  const unique = new Set(selectedQuestionIds)
  if (unique.size !== selectedQuestionIds.length) {
    errors.questions = 'Aynı soru denemede yalnızca bir kez yer alabilir.'
  }

  if (values.examMode === 'scheduled') {
    if (!values.scheduledDate.trim()) {
      errors.scheduledDate = 'Sınav tarihi gerekli.'
    }
    if (!values.scheduledTime.trim()) {
      errors.scheduledTime = 'Sınav saati gerekli.'
    }
    if (!values.lobbyOffsetMinutes || values.lobbyOffsetMinutes <= 0) {
      errors.lobbyOffsetMinutes = 'Lobi süresi pozitif olmalıdır.'
    }
    if (!values.lateEntryMinutes || values.lateEntryMinutes < 0) {
      errors.lateEntryMinutes = 'Geç giriş süresi geçerli olmalıdır.'
    }
    if (values.resultsPublishMode === 'delay') {
      if (!values.resultsDelayMinutes || values.resultsDelayMinutes < 0) {
        errors.resultsDelayMinutes = 'Sonuç gecikmesi geçerli olmalıdır.'
      }
    } else {
      if (!values.resultsPublishDate.trim()) {
        errors.resultsPublishDate = 'Sonuç tarihi gerekli.'
      }
      if (!values.resultsPublishTime.trim()) {
        errors.resultsPublishTime = 'Sonuç saati gerekli.'
      }
    }
  }

  return errors
}
