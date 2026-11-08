import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { enrollInExam, formatTry, getMyCredits, notifyCreditsChanged } from '../lib/credits'
import { useConfirm } from '../hooks/useConfirm'
import { ExamCheckoutDialog } from '../components/ExamCheckoutDialog'
import { primaryButton, secondaryButton } from '../lib/ui'
import type { StudentExamListItem } from '../types/live-exam'
import { liveExamStateLabels } from '../types/live-exam'

const DEFAULT_PRICE_KURUS = 14990

/** Newest first: scheduled exams by their date, practice exams by creation. */
function sortNewestFirst(list: StudentExamListItem[]): StudentExamListItem[] {
  const when = (exam: StudentExamListItem) =>
    new Date(exam.scheduled_start_at ?? exam.created_at ?? 0).getTime()
  return [...list].sort((a, b) => when(b) - when(a))
}

export function DenemelerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [exams, setExams] = useState<StudentExamListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyExamId, setBusyExamId] = useState<string | null>(null)
  /** free (or already paid) exam entries */
  const [freeEntries, setFreeEntries] = useState<number | null>(null)
  const [checkoutExam, setCheckoutExam] = useState<StudentExamListItem | null>(null)
  const requestRef = useRef(0)
  const inFlightRef = useRef(false)
  const closeCheckout = useCallback(() => setCheckoutExam(null), [])

  // One batched request; a response is applied only if it belongs to the
  // latest request, and refreshes never overlap.
  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const requestId = ++requestRef.current

    try {
      const [list, credits] = await Promise.all([fetchStudentExams(), getMyCredits()])
      if (requestId !== requestRef.current) return
      setExams(sortNewestFirst(list))
      setFreeEntries(credits.balance)
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
        setExams(sortNewestFirst(list))
        setFreeEntries(credits.balance)
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

  const startPractice = async (exam: StudentExamListItem) => {
    const attemptId = await startExamAttempt(exam.id)
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

      // a finished practice exam opens its results; retaking is a separate button
      if (exam.finalized_attempt_id) {
        navigate(`/sonuclar/${exam.finalized_attempt_id}`)
        return
      }

      await startPractice(exam)
    } catch (err) {
      setError(getExamErrorMessage(err))
    } finally {
      setBusyExamId(null)
    }
  }

  const handleRetake = async (exam: StudentExamListItem) => {
    setBusyExamId(exam.id)
    setError(null)
    try {
      await startPractice(exam)
    } catch (err) {
      setError(getExamErrorMessage(err))
    } finally {
      setBusyExamId(null)
    }
  }

  // Nobody is enrolled automatically: joining is an explicit choice.
  const needsEnrollment = (exam: StudentExamListItem): boolean =>
    !exam.is_enrolled && !exam.in_progress_attempt_id && !exam.finalized_attempt_id

  const hasFreeEntry = freeEntries !== null && freeEntries > 0

  const handleFreeJoin = async (exam: StudentExamListItem) => {
    const confirmed = await confirm({
      title: 'Ücretsiz katıl',
      message: (
        <>
          <span className="font-medium text-gray-900 dark:text-slate-100">{exam.title}</span>
          {exam.exam_mode === 'scheduled'
            ? ' için ücretsiz deneme hakkını kullanacaksın. Sınava katılmazsan hakkın giriş süresi bitince geri verilir.'
            : ' için ücretsiz deneme hakkını kullanacaksın. Bu denemeyi dilediğin kadar tekrar çözebilirsin.'}
        </>
      ),
      confirmLabel: 'Katıl',
    })
    if (!confirmed) return

    setBusyExamId(exam.id)
    setError(null)
    try {
      await enrollInExam(exam.id)
      notifyCreditsChanged()
      await refresh()
    } catch (err) {
      setError(getExamErrorMessage(err))
      void refresh()
    } finally {
      setBusyExamId(null)
    }
  }

  const priceOf = (exam: StudentExamListItem) => exam.price_kurus ?? DEFAULT_PRICE_KURUS

  const actionLabel = (exam: StudentExamListItem): string => {
    if (exam.exam_mode === 'practice') {
      if (exam.in_progress_attempt_id) return 'Devam et'
      if (exam.finalized_attempt_id) return 'Sonuçları gör'
      return 'Denemeyi başlat'
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
    return 'Kaydın tamam'
  }

  const isActionDisabled = (exam: StudentExamListItem): boolean => {
    if (exam.question_count === 0) return true
    if (exam.exam_mode === 'practice') return false
    if (exam.live_state === 'upcoming' && !exam.can_enter_lobby) return true
    if (exam.live_state === 'results_pending' && !exam.finalized_attempt_id) {
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

  const renderActions = (exam: StudentExamListItem) => {
    const isBusy = busyExamId === exam.id

    if (needsEnrollment(exam)) {
      if (!exam.can_enroll) {
        return (
          <button type="button" disabled className={primaryButton}>
            Kayıt kapandı
          </button>
        )
      }
      if (freeEntries === null) {
        return (
          <button type="button" disabled className={primaryButton}>
            Yükleniyor…
          </button>
        )
      }
      if (hasFreeEntry) {
        return (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleFreeJoin(exam)}
            className={primaryButton}
          >
            {isBusy ? 'Yükleniyor…' : 'Ücretsiz katıl'}
          </button>
        )
      }
      return (
        <button type="button" onClick={() => setCheckoutExam(exam)} className={primaryButton}>
          Satın al · {formatTry(priceOf(exam))}
        </button>
      )
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {exam.exam_mode === 'practice' &&
          exam.finalized_attempt_id &&
          !exam.in_progress_attempt_id && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleRetake(exam)}
              className={secondaryButton}
            >
              Tekrar çöz
            </button>
          )}
        <button
          type="button"
          disabled={isBusy || isActionDisabled(exam)}
          onClick={() => void handleExamAction(exam)}
          className={primaryButton}
        >
          {isBusy ? 'Yükleniyor…' : actionLabel(exam)}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Denemeler</h1>
      <p className="mt-2 max-w-xl text-sm text-gray-600 dark:text-slate-400">
        Aktif HMGSlab deneme ve canlı sınavlarını buradan takip edebilirsin. İlk denemen
        ücretsiz; sonraki her deneme {formatTry(DEFAULT_PRICE_KURUS)}.
      </p>

      {hasFreeEntry && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800 ring-1 ring-green-600/20 dark:bg-green-950/40 dark:text-green-300">
          {freeEntries === 1
            ? '1 ücretsiz denemen var'
            : `${freeEntries} ücretsiz denemen var`}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
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
            className="font-semibold underline"
          >
            Yeniden dene
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : exams.length === 0 && loadError ? null : exams.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">Şu an başlatılabilir deneme bulunmuyor.</p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200 dark:divide-slate-800 dark:border-slate-800">
          {exams.map((exam) => (
            <li key={exam.id} className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                      {exam.title}
                    </h2>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                      {exam.exam_mode === 'practice' && exam.finalized_attempt_id
                        ? 'Tamamlandı'
                        : liveExamStateLabels[exam.live_state]}
                    </span>
                    {exam.is_enrolled && !exam.finalized_attempt_id && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                        Kayıtlısın
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    {exam.question_count} soru · {exam.duration_minutes} dk
                    {exam.exam_mode === 'scheduled' &&
                      exam.scheduled_start_at &&
                      ` · ${formatIstanbulDateTimeShort(exam.scheduled_start_at)}`}
                  </p>
                </div>
                {renderActions(exam)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {checkoutExam && (
        <ExamCheckoutDialog
          title={checkoutExam.title}
          scheduledStartAt={checkoutExam.exam_mode === 'scheduled' ? checkoutExam.scheduled_start_at : null}
          questionCount={checkoutExam.question_count}
          durationMinutes={checkoutExam.duration_minutes}
          priceKurus={priceOf(checkoutExam)}
          onClose={closeCheckout}
        />
      )}
    </div>
  )
}
