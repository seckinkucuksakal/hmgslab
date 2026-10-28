import { supabase } from './supabase'
import type { Subject } from '../types/question-bank'

/**
 * The fixed 19-subject scope (PROJECT_PLAN.md). The database is the source of
 * truth for ids; this list only documents the expected names and order and is
 * used to verify the catalogue the API returns.
 */
export const STANDARD_SUBJECT_NAMES = [
  'Anayasa Yargısı',
  'İdare Hukuku',
  'İdari Yargılama Usulü',
  'Medeni Hukuk',
  'Borçlar Hukuku',
  'Ticaret Hukuku',
  'Hukuk Yargılama Usulü',
  'İcra ve İflas Hukuku',
  'Ceza Hukuku',
  'Ceza Yargılama Usulü',
  'İş ve Sosyal Güvenlik Hukuku',
  'Vergi Hukuku',
  'Vergi Usul Hukuku',
  'Avukatlık Hukuku',
  'Hukuk Felsefesi ve Sosyolojisi',
  'Türk Hukuk Tarihi',
  'Milletlerarası Hukuk',
  'Milletlerarası Özel Hukuk',
  'Genel Kamu Hukuku',
] as const

export const LEGACY_SUBJECT_SUFFIX = ' (kapsam dışı)'

const SUBJECT_COLUMNS =
  'id, name, slug, sort_order, is_active, is_standard, created_at'

function bySortOrder(a: Subject, b: Subject): number {
  return (
    (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
      (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name, 'tr')
  )
}

/** Standard subjects first (fixed order), then legacy ones. */
export function orderSubjects(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => {
    if (a.is_standard !== b.is_standard) return a.is_standard ? -1 : 1
    return bySortOrder(a, b)
  })
}

export function standardSubjectsOnly(subjects: Subject[]): Subject[] {
  return orderSubjects(subjects).filter((subject) => subject.is_standard)
}

export function legacySubjectsOnly(subjects: Subject[]): Subject[] {
  return orderSubjects(subjects).filter((subject) => !subject.is_standard)
}

/** Label for filters/lists; legacy subjects are flagged explicitly. */
export function subjectOptionLabel(subject: Subject): string {
  return subject.is_standard ? subject.name : `${subject.name}${LEGACY_SUBJECT_SUFFIX}`
}

/** Loads every subject the caller can read, in catalogue order. */
export async function fetchSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return orderSubjects((data ?? []) as Subject[])
}

/** True when the loaded standard subjects match the documented 19 names/order. */
export function isCatalogComplete(subjects: Subject[]): boolean {
  const names = standardSubjectsOnly(subjects).map((subject) => subject.name)
  return (
    names.length === STANDARD_SUBJECT_NAMES.length &&
    names.every((name, index) => name === STANDARD_SUBJECT_NAMES[index])
  )
}
