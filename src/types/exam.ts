export type Exam = {
  id: string
  title: string
  description: string | null
  duration_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

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
}

export type ExamFormErrors = {
  title?: string
  durationMinutes?: string
  questions?: string
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

  return errors
}
