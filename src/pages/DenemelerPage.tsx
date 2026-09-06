import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  fetchActiveExams,
  getExamErrorMessage,
  startExamAttempt,
  syncExamAttempt,
} from '../lib/exam-session'
import type { ActiveExamListItem } from '../types/exam-attempt'

export function DenemelerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState<ActiveExamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingExamId, setStartingExamId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    fetchActiveExams(user.id)
      .then(setExams)
      .catch((err) => setError(getExamErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [user])

  const handleStartOrContinue = async (exam: ActiveExamListItem) => {
    setStartingExamId(exam.id)
    setError(null)

    try {
      if (exam.in_progress_attempt_id) {
        await syncExamAttempt(exam.in_progress_attempt_id)
        navigate(`/sinav/${exam.in_progress_attempt_id}`)
        return
      }

      const attemptId = await startExamAttempt(exam.id)
      navigate(`/sinav/${attemptId}`)
    } catch (err) {
      setError(getExamErrorMessage(err))
    } finally {
      setStartingExamId(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Denemeler</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Aktif HMGS deneme sınavlarını buradan başlatabilirsiniz.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : exams.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          Şu an başlatılabilir deneme bulunmuyor.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
          {exams.map((exam) => {
            const isBusy = startingExamId === exam.id
            const hasProgress = Boolean(exam.in_progress_attempt_id)

            return (
              <li key={exam.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-medium text-gray-900">
                      {exam.title}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {exam.question_count} soru · {exam.duration_minutes} dk
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy || exam.question_count === 0}
                    onClick={() => handleStartOrContinue(exam)}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isBusy
                      ? 'Yükleniyor…'
                      : hasProgress
                        ? 'Devam et'
                        : 'Denemeyi başlat'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
