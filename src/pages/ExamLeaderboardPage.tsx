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
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
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
