import { supabase } from './supabase'
import type {
  ActiveExamListItem,
  AttemptSubmitResult,
  AttemptSync,
  ExamSessionQuestion,
} from '../types/exam-attempt'

export async function startExamAttempt(examId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_exam_attempt', {
    p_exam_id: examId,
  })

  if (error) throw error
  return data as string
}

export async function syncExamAttempt(attemptId: string): Promise<AttemptSync> {
  const { data, error } = await supabase.rpc('sync_exam_attempt', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptSync
}

export async function saveAttemptAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('save_attempt_answer', {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    p_selected_option_id: selectedOptionId,
  })

  if (error) throw error
}

export async function submitExamAttempt(
  attemptId: string,
): Promise<AttemptSubmitResult> {
  const { data, error } = await supabase.rpc('submit_exam_attempt', {
    p_attempt_id: attemptId,
  })

  if (error) throw error
  return data as AttemptSubmitResult
}

export async function fetchActiveExams(
  userId: string,
): Promise<ActiveExamListItem[]> {
  const [examsResult, attemptsResult] = await Promise.all([
    supabase
      .from('exams')
      .select('id, title, duration_minutes, exam_questions(count)')
      .eq('is_active', true)
      .order('updated_at', { ascending: false }),
    supabase
      .from('exam_attempts')
      .select('id, exam_id')
      .eq('user_id', userId)
      .eq('status', 'in_progress'),
  ])

  if (examsResult.error) throw examsResult.error
  if (attemptsResult.error) throw attemptsResult.error

  const inProgressByExam = new Map(
    (attemptsResult.data ?? []).map((row) => [row.exam_id, row.id]),
  )

  return (examsResult.data ?? []).map((exam) => {
    const countEntry = Array.isArray(exam.exam_questions)
      ? exam.exam_questions[0]
      : exam.exam_questions
    const questionCount =
      countEntry && typeof countEntry === 'object' && 'count' in countEntry
        ? countEntry.count
        : 0

    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      question_count: questionCount,
      in_progress_attempt_id: inProgressByExam.get(exam.id) ?? null,
    }
  })
}

export async function loadExamSessionQuestions(
  attemptId: string,
): Promise<ExamSessionQuestion[]> {
  const { data: rows, error } = await supabase
    .from('attempt_questions')
    .select('sort_order, question_id, questions(id, question_text)')
    .eq('attempt_id', attemptId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  if (!rows?.length) return []

  const questionIds = rows.map((row) => row.question_id)

  const [optionsResult, answersResult] = await Promise.all([
    supabase
      .from('question_options_public')
      .select('id, question_id, option_key, option_text, sort_order')
      .in('question_id', questionIds)
      .order('sort_order', { ascending: true }),
    supabase
      .from('attempt_answers')
      .select('question_id, selected_option_id')
      .eq('attempt_id', attemptId),
  ])

  if (optionsResult.error) throw optionsResult.error
  if (answersResult.error) throw answersResult.error

  const optionsByQuestion = new Map<string, ExamSessionQuestion['options']>()
  for (const option of optionsResult.data ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? []
    list.push(option)
    optionsByQuestion.set(option.question_id, list)
  }

  const answersByQuestion = new Map(
    (answersResult.data ?? []).map((row) => [
      row.question_id,
      row.selected_option_id,
    ]),
  )

  return rows.map((row) => {
    const question = Array.isArray(row.questions)
      ? row.questions[0]
      : row.questions

    return {
      id: row.question_id,
      sort_order: row.sort_order,
      question_text: question?.question_text ?? '',
      options: optionsByQuestion.get(row.question_id) ?? [],
      selected_option_id: answersByQuestion.get(row.question_id) ?? null,
    }
  })
}

export function getExamErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: string }).message)
    if (message.includes('Deneme')) return message
    if (message.includes('Unauthorized')) return 'Oturum gerekli.'
    if (message.includes('düzenlenemez')) return 'Deneme artık düzenlenemez.'
    if (message.includes('tamamlanmış')) return 'Deneme zaten tamamlanmış.'
  }

  return 'Bir hata oluştu. Lütfen tekrar deneyin.'
}
