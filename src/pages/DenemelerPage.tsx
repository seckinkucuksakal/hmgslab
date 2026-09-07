import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  fetchStudentExams,
  getLiveExamErrorMessage,
  startScheduledExamAttempt,
} from '../lib/live-exam'
import {
  getExamErrorMessage,
  startExamAttempt,
  syncExamAttempt,
} from '../lib/exam-session'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import type { StudentExamListItem } from '../types/live-exam'
import { liveExamStateLabels } from '../types/live-exam'

export function DenemelerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState<StudentExamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyExamId, setBusyExamId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    fetchStudentExams(user.id)
      .then(setExams)
      .catch((err) => setError(getLiveExamErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [user])

  const handleExamAction = async (exam: StudentExamListItem) => {
    setBusyExamId(exam.id)
    setError(null)

    try {
      if (exam.exam_mode === 'scheduled') {
        if (exam.in_progress_attempt_id) {
          await syncExamAttempt(exam.in_progress_attempt_id)
          navigate(`/sinav/${exam.in_progress_attempt_id}`)
          return
        }

        if (exam.finalized_attempt_id && !exam.results_available) {
          navigate(`/sinav/${exam.finalized_attempt_id}/tamamlandi`)
          return
        }

        if (exam.finalized_attempt_id && exam.results_available) {
          navigate(`/sonuclar/${exam.finalized_attempt_id}`)
          return
        }

        if (
          exam.can_enter_exam &&
          (exam.live_state === 'in_progress_entry_open' ||
            exam.live_state === 'in_progress_entry_closed')
        ) {
          const attemptId = await startScheduledExamAttempt(exam.id)
          navigate(`/sinav/${attemptId}`)
          return
        }

        navigate(`/denemeler/${exam.id}/lobi`)
        return
      }

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
      setBusyExamId(null)
    }
  }

  const actionLabel = (exam: StudentExamListItem): string => {
    if (exam.exam_mode === 'practice') {
      return exam.in_progress_attempt_id ? 'Devam et' : 'Denemeyi başlat'
    }

    if (exam.in_progress_attempt_id) return 'Sınava dön'
    if (exam.finalized_attempt_id && exam.results_available) return 'Sonuçları gör'
    if (exam.finalized_attempt_id) return 'Tamamlandı'
    if (
      exam.can_enter_exam &&
      (exam.live_state === 'in_progress_entry_open' ||
        exam.live_state === 'in_progress_entry_closed')
    ) {
      return 'Sınava gir'
    }
    if (exam.can_enter_lobby) return 'Giriş alanına git'
    if (exam.live_state === 'results_published') return 'Sonuçları gör'
    return 'Detay'
  }

  const isActionDisabled = (exam: StudentExamListItem): boolean => {
    if (exam.question_count === 0) return true
    if (exam.exam_mode === 'practice') return false
    if (exam.live_state === 'upcoming' && !exam.can_enter_lobby) return true
    if (
      exam.live_state === 'results_pending' &&
      !exam.finalized_attempt_id
    ) {
      return true
    }
    if (
      (exam.live_state === 'in_progress_entry_closed' ||
        exam.live_state === 'results_pending') &&
      !exam.in_progress_attempt_id &&
      !exam.finalized_attempt_id
    ) {
      return true
    }
    return false
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Denemeler</h1>
      <p className="mt-2 max-w-lg text-sm text-gray-600">
        Aktif HMGSlab deneme ve canlı sınavları buradan takip edebilirsiniz.
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
            const isBusy = busyExamId === exam.id

            return (
              <li key={exam.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-medium text-gray-900">
                        {exam.title}
                      </h2>
                      <span className="text-xs text-gray-500">
                        {liveExamStateLabels[exam.live_state]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {exam.question_count} soru · {exam.duration_minutes} dk
                      {exam.exam_mode === 'scheduled' &&
                        exam.scheduled_start_at &&
                        ` · ${formatIstanbulDateTimeShort(exam.scheduled_start_at)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy || isActionDisabled(exam)}
                    onClick={() => handleExamAction(exam)}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isBusy ? 'Yükleniyor…' : actionLabel(exam)}
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
