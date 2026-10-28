import { supabase } from './supabase'
import type { Difficulty } from '../types/question-bank'

export const QUESTION_PAGE_SIZE = 25

export type QuestionListRow = {
  id: string
  question_text: string
  difficulty: Difficulty
  is_active: boolean
  created_at: string
  subject_id: string
  topic_id: string
  subjects: { name: string } | null
  topics: { name: string } | null
}

export type QuestionSearchParams = {
  search: string
  subjectId: string
  topicId: string
  difficulty: string
  active: 'all' | 'active' | 'inactive'
  page: number
  pageSize?: number
}

const SELECT =
  'id, question_text, difficulty, is_active, created_at, subject_id, topic_id, subjects(name), topics(name)'

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function normalizeQuestionRow(row: Record<string, unknown>): QuestionListRow {
  const one = (value: unknown) => (Array.isArray(value) ? value[0] : value) ?? null
  return {
    ...(row as unknown as QuestionListRow),
    subjects: one(row.subjects) as QuestionListRow['subjects'],
    topics: one(row.topics) as QuestionListRow['topics'],
  }
}

/**
 * Database-side search + filter + pagination over the whole question bank.
 * Order is created_at desc, id desc so pages are stable.
 */
export async function searchQuestions(
  params: QuestionSearchParams,
): Promise<{ rows: QuestionListRow[]; total: number }> {
  const pageSize = params.pageSize ?? QUESTION_PAGE_SIZE
  const from = params.page * pageSize

  let query = supabase
    .from('questions')
    .select(SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)

  const term = params.search.trim()
  if (term) query = query.ilike('question_text', `%${escapeLike(term)}%`)
  if (params.subjectId) query = query.eq('subject_id', params.subjectId)
  if (params.topicId) query = query.eq('topic_id', params.topicId)
  if (params.difficulty) query = query.eq('difficulty', params.difficulty)
  if (params.active === 'active') query = query.eq('is_active', true)
  if (params.active === 'inactive') query = query.eq('is_active', false)

  const { data, error, count } = await query
  if (error) throw error

  return {
    rows: (data ?? []).map((row) => normalizeQuestionRow(row as Record<string, unknown>)),
    total: count ?? 0,
  }
}

export async function fetchQuestionsByIds(ids: string[]): Promise<QuestionListRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('questions').select(SELECT).in('id', ids)
  if (error) throw error
  return (data ?? []).map((row) => normalizeQuestionRow(row as Record<string, unknown>))
}
