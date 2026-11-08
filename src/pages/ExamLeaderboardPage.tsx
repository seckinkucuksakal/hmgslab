import { backLink } from '../lib/ui'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LeaderboardPageContent } from '../components/exam/LeaderboardTable'
import {
  getExamLeaderboard,
  getRankingErrorMessage,
} from '../lib/exam-ranking'
import type { ExamLeaderboard } from '../types/exam-ranking'

export function ExamLeaderboardPage() {
  const { examId } = useParams<{ examId: string }>()
  const [data, setData] = useState<ExamLeaderboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!examId) return

    getExamLeaderboard(examId)
      .then(setData)
      .catch((err) => setError(getRankingErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [examId])

  if (loading) {
    return <p className="text-sm text-gray-500">Sıralama yükleniyor…</p>
  }

  if (error || !data) {
    return (
      <div>
        <p className="text-sm text-red-700">{error ?? 'Sıralama bulunamadı.'}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 mr-4 rounded-md bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Yeniden dene
        </button>
        <Link
          to="/denemeler"
          className={`mt-4 ${backLink}`}
        >
          Denemelere dön
        </Link>
      </div>
    )
  }

  return (
    <LeaderboardPageContent
      data={data}
      backHref="/denemeler"
      backLabel="← Denemeler"
    />
  )
}
