export type Difficulty = 'easy' | 'medium' | 'hard'

export type Subject = {
  id: string
  name: string
  slug: string
  sort_order: number | null
  is_active: boolean
  created_at: string
}

export type Topic = {
  id: string
  subject_id: string
  name: string
  slug: string
  sort_order: number | null
  is_active: boolean
  created_at: string
}

export type Question = {
  id: string
  subject_id: string
  topic_id: string
  question_text: string
  explanation: string | null
  difficulty: Difficulty
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Safe option shape for authenticated users (no correct answer). */
export type QuestionOptionPublic = {
  id: string
  question_id: string
  option_key: string
  option_text: string
  sort_order: number | null
  created_at: string
}

/** Admin-only option shape including the correct answer flag. */
export type QuestionOption = QuestionOptionPublic & {
  is_correct: boolean
}

export type SubjectInsert = Pick<Subject, 'name' | 'slug'> &
  Partial<Pick<Subject, 'sort_order' | 'is_active'>>

export type TopicInsert = Pick<Topic, 'subject_id' | 'name' | 'slug'> &
  Partial<Pick<Topic, 'sort_order' | 'is_active'>>

export type QuestionInsert = Pick<
  Question,
  'subject_id' | 'topic_id' | 'question_text' | 'difficulty'
> &
  Partial<Pick<Question, 'explanation' | 'is_active'>>

export type QuestionOptionInsert = Pick<
  QuestionOption,
  'question_id' | 'option_key' | 'option_text' | 'is_correct'
> &
  Partial<Pick<QuestionOption, 'sort_order'>>
