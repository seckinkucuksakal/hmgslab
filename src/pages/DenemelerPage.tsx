import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  fetchStudentExams,
  getLiveExamErrorMessage,
  startScheduledExamAttempt,
} from '../lib/live-exam'
import {
  getExamErrorMessage,
  getPostSubmitPath,
  startExamAttempt,
  syncExamAttempt,
} from '../lib/exam-session'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'
import { enrollInExam, getMyCredits } from '../lib/credits'
import { routes } from '../lib/routes'
import type { StudentExamListItem } from '../types/live-exam'
import { liveExamStateLabels } from '../types/live-exam'

export function DenemelerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [exams, setExams] = useState<StudentExamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyExamId, setBusyExamId] = useState<string | null>(null)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const requestRef = useRef(0)
  const inFlightRef = useRef(false)

  // One batched request; a response is applied only if it belongs to the
  // latest request, and refreshes never overlap.
  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const requestId = ++requestRef.current

    try {
      const [list, credits] = await Promise.all([fetchStudentExams(), getMyCredits()])
      if (requestId !== requestRef.current) return
      setExams(list)
      setCreditBalance(credits.balance)
      setLoadError(null)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setLoadError(getLiveExamErrorMessage(err))
    } finally {
      inFlightRef.current = false
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    let cancelled = false
    Promise.all([fetchStudentExams(), getMyCredits()])
      .then(([list, credits]) => {
        if (cancelled || requestRef.current > 0) return
        setExams(list)
        setCreditBalance(credits.balance)
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled || requestRef.current > 0) return
        setLoadError(getLiveExamErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = window.setInterval(onVisible, 30_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [user, refresh])

  // The list may be stale: confirm the attempt is still running before
  // opening it, otherwise go to the screen matching its real state.
  const resumeAttempt = async (attemptId: string) => {
    const current = await syncExamAttempt(attemptId)
    if (current.status !== 'in_progress') {
      void refresh()
      navigate(getPostSubmitPath(attemptId, current), { replace: false })
      return
    }
    navigate(`/sinav/${attemptId}`)
  }

  const handleExamAction = async (exam: StudentExamListItem) => {
    setBusyExamId(exam.id)
    setError(null)

    try {
      if (exam.exam_mode === 'scheduled') {
        if (exam.in_progress_attempt_id) {
          await resumeAttempt(exam.in_progress_attempt_id)
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
        await resumeAttempt(exam.in_progress_attempt_id)
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

  // Nobody is enrolled automatically: enrolling is an explicit choice that
  // spends one credit on the server.
  const needsEnrollment = (exam: StudentExamListItem): boolean =>
    !exam.is_enrolled && !exam.in_progress_attempt_id && !exam.finalized_attempt_id

  const handleEnroll = async (exam: StudentExamListItem) => {
    const balance = creditBalance ?? 0
    const confirmed = window.confirm(
      `"${exam.title}" denemesine kaydolmak 1 deneme hakkınızı kullanır.\n` +
        `Kayıttan sonra kalan hakkınız: ${balance - 1}.` +
        (exam.exam_mode === 'scheduled'
          ? '\nSınava katılmazsanız hakkınız giriş süresi bitince iade edilir.'
          : '') +
        '\n\nKaydolmak istiyor musunuz?',
    )
    if (!confirmed) return

    setBusyExamId(exam.id)
    setError(null)
    try {
      const result = await enrollInExam(exam.id)
      setCreditBalance(result.credit_balance)
      await refresh()
    } catch (err) {
      setError(getExamErrorMessage(err))
      void refresh()
    } finally {
      setBusyExamId(null)
    }
  }

  const enrollLabel = (exam: StudentExamListItem): string => {
    if (!exam.can_enroll) return 'Kayıt kapandı'
    if ((creditBalance ?? 0) < 1) return 'Hakkınız yok'
    return 'Kaydol (1 hak)'
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
        Bir denemeye katılmak için önce kaydolmanız gerekir; her kayıt 1 deneme
        hakkı kullanır.
      </p>

      {creditBalance !== null && (
        <p className="mt-4 text-sm text-gray-700">
          Kalan deneme hakkınız:{' '}
          <span className="font-semibold text-gray-900">{creditBalance}</span>
          {' · '}
          <Link to={routes.paketler} className="font-medium text-gray-900 underline">
            Hak satın al
          </Link>
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loadError && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>
            {exams.length > 0
              ? 'Liste güncellenemedi; son bilinen durum gösteriliyor.'
              : loadError}
          </span>
          <button
            type="button"
            onClick={() => {
              if (exams.length === 0) setLoading(true)
              void refresh()
            }}
            className="font-medium underline"
          >
            Yeniden dene
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : exams.length === 0 && loadError ? null : exams.length === 0 ? (
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
                      {exam.is_enrolled && (
                        <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700">
                          Kayıtlısınız
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {exam.question_count} soru · {exam.duration_minutes} dk
                      {exam.exam_mode === 'scheduled' &&
                        exam.scheduled_start_at &&
                        ` · ${formatIstanbulDateTimeShort(exam.scheduled_start_at)}`}
                    </p>
                  </div>
                  {needsEnrollment(exam) ? (
                    <button
                      type="button"
                      disabled={
                        isBusy ||
                        creditBalance === null ||
                        !exam.can_enroll ||
                        creditBalance < 1
                      }
                      onClick={() => handleEnroll(exam)}
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {isBusy ? 'Yükleniyor…' : enrollLabel(exam)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy || isActionDisabled(exam)}
                      onClick={() => handleExamAction(exam)}
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {isBusy ? 'Yükleniyor…' : actionLabel(exam)}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
