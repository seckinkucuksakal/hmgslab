export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E'] as const

/**
 * Admin screens filter the question bank in memory, so the fetch has to stay
 * bounded. When the cap is reached the UI tells the admin to narrow the search.
 */
export const QUESTION_BANK_FETCH_LIMIT = 500

export type OptionKey = (typeof OPTION_KEYS)[number]

export type QuestionFormValues = {
  subjectId: string
  topicId: string
  questionText: string
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  isActive: boolean
  options: Record<OptionKey, string>
  correctOption: OptionKey
}

export type QuestionFormFieldErrors = {
  subjectId?: string
  topicId?: string
  questionText?: string
  difficulty?: string
  options?: string
  general?: string
}

export const emptyQuestionForm = (): QuestionFormValues => ({
  subjectId: '',
  topicId: '',
  questionText: '',
  explanation: '',
  difficulty: 'medium',
  isActive: true,
  options: { A: '', B: '', C: '', D: '', E: '' },
  correctOption: 'A',
})

export function validateQuestionFormFields(
  values: QuestionFormValues,
): QuestionFormFieldErrors {
  const errors: QuestionFormFieldErrors = {}

  if (!values.subjectId) errors.subjectId = 'Ders seçimi gerekli.'
  if (!values.topicId) errors.topicId = 'Konu seçimi gerekli.'
  if (!values.questionText.trim()) errors.questionText = 'Soru metni gerekli.'
  if (!values.difficulty) errors.difficulty = 'Zorluk seviyesi gerekli.'

  const hasEmptyOption = OPTION_KEYS.some((key) => !values.options[key].trim())
  if (hasEmptyOption) errors.options = 'Tüm seçenekleri doldurun.'

  if (!OPTION_KEYS.includes(values.correctOption)) {
    errors.options = 'Doğru cevabı seçin.'
  }

  return errors
}

export function formValuesToOptionsPayload(values: QuestionFormValues) {
  return OPTION_KEYS.map((key, index) => ({
    option_key: key,
    option_text: values.options[key].trim(),
    is_correct: key === values.correctOption,
    sort_order: index + 1,
  }))
}

export const difficultyLabels: Record<QuestionFormValues['difficulty'], string> = {
  easy: 'Kolay',
  medium: 'Orta',
  hard: 'Zor',
}

/** @deprecated Use validateQuestionFormFields instead */
export function validateQuestionForm(values: QuestionFormValues): string | null {
  const errors = validateQuestionFormFields(values)
  return (
    errors.subjectId ??
    errors.topicId ??
    errors.questionText ??
    errors.difficulty ??
    errors.options ??
    null
  )
}

export function retainBulkEntryFields(values: QuestionFormValues): QuestionFormValues {
  return {
    ...emptyQuestionForm(),
    subjectId: values.subjectId,
    topicId: values.topicId,
    difficulty: values.difficulty,
    isActive: values.isActive,
  }
}
