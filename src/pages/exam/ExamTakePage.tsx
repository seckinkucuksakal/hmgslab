import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import {
  AnswerSaveQueue,
  answerStorageKey,
  type AnswerQueueState,
} from '../../lib/answer-queue'
import {
  getExamErrorMessage,
  getPostSubmitPath,
  loadExamSession,
  saveAttemptAnswer,
  submitExamAttempt,
  syncExamAttempt,
} from '../../lib/exam-session'
import type { AttemptSync, ExamSessionQuestion } from '../../types/exam-attempt'
import { formatRemainingTime } from '../../types/exam-attempt'
import { SITE_NAME } from '../../lib/brand'

const SUBMIT_DRAIN_TIMEOUT_MS = 10_000

function getStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function ExamTakePage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const { displayName } = useProfile()
  const { user } = useAuth()
  const userId = user?.id

  const [sync, setSync] = useState<AttemptSync | null>(null)
  const [examDescription, setExamDescription] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ExamSessionQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queueState, setQueueState] = useState<AnswerQueueState>({
    unsaved: 0,
    saving: false,
    failing: false,
    closed: false,
    rejected: 0,
  })
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [unsavedAtSubmit, setUnsavedAtSubmit] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  const syncAnchorRef = useRef<{ at: number; seconds: number } | null>(null)
  const expirySyncSentRef = useRef(false)
  const submitLockRef = useRef(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const queue = useMemo(
    () =>
      attemptId && userId
        ? new AnswerSaveQueue({
            save: (questionId, optionId) =>
              saveAttemptAnswer(attemptId, questionId, optionId),
            storage: getStorage(),
            storageKey: answerStorageKey(userId, attemptId),
            onChange: setQueueState,
          })
        : null,
    [attemptId, userId],
  )

  useEffect(() => {
    if (!queue) return
    queue.activate()
    return () => queue.dispose()
  }, [queue])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      queue?.retryNow()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [queue])

  useEffect(() => {
    if (queueState.unsaved === 0) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [queueState.unsaved])

  const applySync = useCallback((next: AttemptSync) => {
    setSync(next)
    syncAnchorRef.current = {
      at: Date.now(),
      seconds: next.remaining_seconds,
    }
    if (next.remaining_seconds > 0) {
      expirySyncSentRef.current = false
    }
    setRemainingSeconds(next.remaining_seconds)
  }, [])

  const navigateAfterAttemptEnd = useCallback(
    (next: AttemptSync) => {
      queue?.clear()
      navigate(getPostSubmitPath(next.id, next), { replace: true })
    },
    [navigate, queue],
  )

  const loadSession = useCallback(async () => {
    if (!attemptId || !queue) return

    setError(null)

    try {
      // Check the attempt state first so ended attempts never hit the
      // in-progress-only session loader.
      const nextSync = await syncExamAttempt(attemptId)
      applySync(nextSync)

      if (nextSync.status !== 'in_progress') {
        navigateAfterAttemptEnd(nextSync)
        return
      }

      const session = await loadExamSession(attemptId)

      // Recovered (unconfirmed) answers win over what the server last saw.
      const pending = new Map(queue.pendingAnswers())
      setExamDescription(session.exam_description)
      setQuestions(
        session.questions.map((q) =>
          pending.has(q.id) ? { ...q, selected_option_id: pending.get(q.id)! } : q,
        ),
      )
      setLoading(false)
      if (pending.size > 0) queue.retryNow()
    } catch (err) {
      setError(getExamErrorMessage(err))
      setLoading(false)
    }
  }, [applySync, attemptId, navigateAfterAttemptEnd, queue])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!sync || sync.status !== 'in_progress') return

    const tick = window.setInterval(() => {
      const anchor = syncAnchorRef.current
      if (!anchor) return

      const elapsed = Math.floor((Date.now() - anchor.at) / 1000)
      const next = Math.max(0, anchor.seconds - elapsed)
      setRemainingSeconds(next)

      if (next === 0 && !expirySyncSentRef.current) {
        expirySyncSentRef.current = true
        syncExamAttempt(attemptId!)
          .then((expiredSync) => {
            applySync(expiredSync)
            if (expiredSync.status !== 'in_progress') {
              navigateAfterAttemptEnd(expiredSync)
            }
          })
          .catch(() => {})
      }
    }, 1000)

    return () => window.clearInterval(tick)
  }, [applySync, attemptId, navigateAfterAttemptEnd, sync])

  useEffect(() => {
    if (!attemptId || !sync || sync.status !== 'in_progress') return

    const resync = window.setInterval(() => {
      syncExamAttempt(attemptId)
        .then((nextSync) => {
          applySync(nextSync)
          if (nextSync.status !== 'in_progress') {
            navigateAfterAttemptEnd(nextSync)
          }
        })
        .catch(() => {})
    }, 60_000)

    return () => window.clearInterval(resync)
  }, [applySync, attemptId, navigateAfterAttemptEnd, sync])

  useEffect(() => {
    if (!showConfirm) return

    confirmButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setShowConfirm(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirm, submitting])

  const currentQuestion = questions[currentIndex]

  const answeredSet = new Set(
    questions.filter((q) => q.selected_option_id).map((q) => q.id),
  )

  const blankCount = questions.length - answeredSet.size
  const isScheduled = sync?.exam_mode === 'scheduled'

  const inputsLocked =
    submitting || remainingSeconds <= 0 || queueState.closed || sync?.status !== 'in_progress'

  const setAnswer = (optionId: string | null) => {
    if (!queue || !currentQuestion || inputsLocked) return
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === currentQuestion.id ? { ...q, selected_option_id: optionId } : q,
      ),
    )
    queue.set(currentQuestion.id, optionId)
  }

  const handleSelectOption = (optionId: string) => setAnswer(optionId)
  const handleClearAnswer = () => setAnswer(null)

  const handleSubmit = async (force = false) => {
    if (!attemptId || !queue || submitLockRef.current) return

    submitLockRef.current = true
    setSubmitting(true)
    setError(null)

    try {
      // Wait (bounded) for in-flight/pending answers before submitting.
      if (!force) {
        const drained = await queue.drain(SUBMIT_DRAIN_TIMEOUT_MS)
        if (!drained && !queue.state.closed) {
          setUnsavedAtSubmit(queue.state.unsaved)
          submitLockRef.current = false
          setSubmitting(false)
          return
        }
      }

      const result = await submitExamAttempt(attemptId)
      queue.clear()
      navigate(getPostSubmitPath(attemptId, result), { replace: true })
    } catch (err) {
      setError(getExamErrorMessage(err))
      submitLockRef.current = false
      setSubmitting(false)
      setShowConfirm(false)
    }
  }

  const saveStatus = (() => {
    if (queueState.unsaved > 0 && (queueState.failing || !online)) {
      return {
        text: `Kaydedilmeyen ${queueState.unsaved} cevap${online ? '' : ' (çevrimdışı)'}. Bağlantı gelince yeniden denenecek.`,
        tone: 'error' as const,
      }
    }
    if (queueState.unsaved > 0 || queueState.saving) {
      return { text: 'Kaydediliyor…', tone: 'neutral' as const }
    }
    if (queueState.closed) {
      return { text: 'Cevap girişi kapandı.', tone: 'error' as const }
    }
    return { text: 'Kaydedildi', tone: 'ok' as const }
  })()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Sınav yükleniyor…</p>
      </div>
    )
  }

  if (error && !sync) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
        >
          Denemelere dön
        </Link>
      </div>
    )
  }

  if (!sync || !currentQuestion) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-gray-600">Sınav verisi bulunamadı.</p>
        <Link
          to="/denemeler"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
        >
          Denemelere dön
        </Link>
      </div>
    )
  }

  const timerClass =
    remainingSeconds <= 300
      ? 'text-red-700 tabular-nums'
      : 'text-gray-900 tabular-nums'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {SITE_NAME}
            </p>
            <h1 className="truncate text-base font-semibold text-gray-900">
              {sync.exam_title}
            </h1>
            <p className="mt-1 text-xs text-gray-500">{displayName}</p>
            {examDescription && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                {examDescription}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500">Kalan süre</p>
            <p className={`text-lg font-semibold ${timerClass}`}>
              {formatRemainingTime(remainingSeconds)}
            </p>
            <p
              role="status"
              aria-live="polite"
              className={`mt-1 text-xs ${
                saveStatus.tone === 'error'
                  ? 'text-red-700'
                  : saveStatus.tone === 'ok'
                    ? 'text-green-700'
                    : 'text-gray-500'
              }`}
            >
              {saveStatus.text}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <p className="mx-auto mt-4 max-w-3xl px-4 text-sm text-red-700 sm:px-6">
          {error}
        </p>
      )}
      {queueState.rejected > 0 && (
        <p className="mx-auto mt-4 max-w-3xl px-4 text-sm text-red-700 sm:px-6">
          {queueState.rejected} cevap sunucu tarafından kabul edilmedi.
        </p>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <p className="mb-4 text-sm text-gray-500">
          Soru {currentQuestion.sort_order} / {questions.length}
        </p>

        <p className="mb-8 text-base leading-relaxed text-gray-900 sm:text-lg">
          {currentQuestion.question_text}
        </p>

        <fieldset className="space-y-3" disabled={inputsLocked}>
          <legend className="sr-only">Cevap seçenekleri</legend>
          {currentQuestion.options.map((option) => {
            const selected = currentQuestion.selected_option_id === option.id
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                  selected
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  checked={selected}
                  onChange={() => handleSelectOption(option.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="mr-2 font-medium text-gray-700">
                    {option.option_key}.
                  </span>
                  {option.option_text}
                </span>
              </label>
            )
          })}
        </fieldset>

        {currentQuestion.selected_option_id && (
          <button
            type="button"
            onClick={handleClearAnswer}
            disabled={inputsLocked}
            className="mt-4 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            Cevabı temizle
          </button>
        )}
      </main>

      <footer className="border-t border-gray-200 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex flex-wrap gap-2">
            {questions.map((question, index) => {
              const isCurrent = index === currentIndex
              const isAnswered = answeredSet.has(question.id)
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  className={`h-8 min-w-8 rounded border px-2 text-xs font-medium ${
                    isCurrent
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : isAnswered
                        ? 'border-gray-400 bg-gray-100 text-gray-900'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                  aria-label={`Soru ${question.sort_order}${isAnswered ? ', cevaplandı' : ', boş'}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {question.sort_order}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={currentIndex >= questions.length - 1}
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {isScheduled ? 'Sınavı erken bitir' : 'Sınavı bitir'}
            </button>
          </div>
        </div>
      </footer>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-title"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 id="submit-title" className="text-base font-semibold text-gray-900">
              {isScheduled ? 'Sınavı erken bitir' : 'Sınavı bitir'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {isScheduled
                ? 'Sınavı bitirdiğinizde cevaplarınızı artık değiştiremezsiniz. Devam etmek istiyor musunuz?'
                : blankCount > 0
                  ? `${blankCount} soruyu boş bıraktınız. Sınavı bitirmek istediğinize emin misiniz?`
                  : 'Sınavı bitirmek istediğinize emin misiniz?'}
            </p>
            {unsavedAtSubmit > 0 && (
              <p className="mt-3 text-sm text-red-700">
                {unsavedAtSubmit} cevap sunucuya kaydedilemedi. Bağlantınızı
                kontrol edip yeniden deneyin; isterseniz bu cevaplar olmadan da
                bitirebilirsiniz.
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setUnsavedAtSubmit(0)
                  setShowConfirm(false)
                }}
                disabled={submitting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleSubmit()}
                disabled={submitting}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting
                  ? 'Kayıtlar bekleniyor…'
                  : unsavedAtSubmit > 0
                    ? 'Yeniden dene'
                    : 'Evet, bitir'}
              </button>
              {unsavedAtSubmit > 0 && (
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Kaydedilmeyenlerle bitir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
