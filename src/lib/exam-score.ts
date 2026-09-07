/** HMGS-style score: (correct / total) × 100, half-up to 2 decimals. */
export function computeExamScore(correct: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((correct * 10_000) / total) / 100
}

/** Points per question for a given exam size (e.g. 120 → 0,833333…). */
export function pointsPerQuestion(total: number): number {
  if (total <= 0) return 0
  return Math.round((10_000 / total) * 1_000_000) / 1_000_000
}

export function formatExamScore(score: number): string {
  const normalized = Math.round(score * 100) / 100
  return normalized.toLocaleString('tr-TR', {
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
