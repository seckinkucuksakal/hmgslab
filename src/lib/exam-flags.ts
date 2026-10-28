/** "Come back later" flags are a local convenience, separate from answers. */

export function examFlagsKey(userId: string, attemptId: string): string {
  return `hmgslab:exam-flags:${userId}:${attemptId}`
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadExamFlags(key: string): Set<string> {
  try {
    const raw = storage()?.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveExamFlags(key: string, flags: Set<string>): void {
  try {
    if (flags.size === 0) storage()?.removeItem(key)
    else storage()?.setItem(key, JSON.stringify([...flags]))
  } catch {
    // storage unavailable: flags still work for this session
  }
}

export function clearExamFlags(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    // ignore
  }
}

export type QuestionFilter = 'all' | 'blank' | 'flagged'

export function matchesFilter(
  filter: QuestionFilter,
  answered: boolean,
  flagged: boolean,
): boolean {
  if (filter === 'blank') return !answered
  if (filter === 'flagged') return flagged
  return true
}

/** Nearest question index in `direction` that passes the filter, or null. */
export function stepIndex(
  from: number,
  direction: -1 | 1,
  total: number,
  isVisible: (index: number) => boolean,
): number | null {
  for (let i = from + direction; i >= 0 && i < total; i += direction) {
    if (isVisible(i)) return i
  }
  return null
}
