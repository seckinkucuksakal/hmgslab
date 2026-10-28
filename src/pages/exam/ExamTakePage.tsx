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
import {
  clearExamFlags,
  examFlagsKey,
  loadExamFlags,
  matchesFilter,
  saveExamFlags,
  stepIndex,
  type QuestionFilter,
} from '../../lib/exam-flags'

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'

const filterLabels: Record<QuestionFilter, string> = {
  all: 'Tümü',
  blank: 'Boş',
  flagged: 'İşaretli',
}

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
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set())
  const [filter, setFilter] = useState<QuestionFilter>('all')

  const syncAnchorRef = useRef<{ at: number; seconds: number } | null>(null)
  const expirySyncSentRef = useRef(false)
  const submitLockRef = useRef(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const finishButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

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

  const flagsKey = attemptId && userId ? examFlagsKey(userId, attemptId) : null

  const clearLocalState = useCallback(() => {
    queue?.clear()
    if (flagsKey) clearExamFlags(flagsKey)
  }, [queue, flagsKey])

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
      clearLocalState()
      navigate(getPostSubmitPath(next.id, next), { replace: true })
    },
    [navigate, clearLocalState],
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
      if (flagsKey) setFlagged(loadExamFlags(flagsKey))
      setLoading(false)
      if (pending.size > 0) queue.retryNow()
    } catch (err) {
      setError(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'İnternet bağlantısı yok. Bağlantınız gelince yeniden deneyin; kayıtlı cevaplarınız korunur.'
          : getExamErrorMessage(err),
      )
      setLoading(false)
    }
  }, [applySync, attemptId, flagsKey, navigateAfterAttemptEnd, queue])

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
    const opener = finishButtonRef.current

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        setShowConfirm(false)
        return
      }
      if (event.key !== 'Tab') return

      // keep focus inside the dialog
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      opener?.focus()
    }
  }, [showConfirm, submitting])

  const currentQuestion = questions[currentIndex]

  const answeredSet = new Set(
    questions.filter((q) => q.selected_option_id).map((q) => q.id),
  )

  const blankCount = questions.length - answeredSet.size
  const flaggedCount = questions.filter((q) => flagged.has(q.id)).length

  const isVisible = (index: number) => {
    const question = questions[index]
    return (
      index === currentIndex ||
      matchesFilter(filter, answeredSet.has(question.id), flagged.has(question.id))
    )
  }
  const prevIndex = stepIndex(currentIndex, -1, questions.length, (i) =>
    filter === 'all' ? true : isVisible(i),
  )
  const nextIndex = stepIndex(currentIndex, 1, questions.length, (i) =>
    filter === 'all' ? true : isVisible(i),
  )

  const toggleFlag = () => {
    if (!currentQuestion) return
    setFlagged((current) => {
      const next = new Set(current)
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id)
      else next.add(currentQuestion.id)
      if (flagsKey) saveExamFlags(flagsKey, next)
      return next
    })
  }

  const retryLoad = () => {
    setLoading(true)
    void loadSession()
  }
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
      clearLocalState()
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

  if (error && (!sync || questions.length === 0)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Yeniden denemek cevaplarınızı silmez.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={retryLoad}
            className={`rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 ${focusRing}`}
          >
            Yeniden dene
          </button>
          <Link
            to="/denemeler"
            className={`text-sm text-gray-600 hover:text-gray-900 ${focusRing}`}
          >
            Denemelere dön
          </Link>
        </div>
      </div>
    )
  }

  if (!sync || !currentQuestion) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-gray-600">Sınav verisi bulunamadı.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={retryLoad}
            className={`rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 ${focusRing}`}
          >
            Yeniden dene
          </button>
          <Link
            to="/denemeler"
            className={`text-sm text-gray-600 hover:text-gray-900 ${focusRing}`}
          >
            Denemelere dön
          </Link>
        </div>
      </div>
    )
  }

  const timerClass =
    remainingSeconds <= 300
      ? 'text-red-700 tabular-nums'
      : 'text-gray-900 tabular-nums'

  const currentFlagged = flagged.has(currentQuestion.id)
  const visibleIndexes = questions
    .map((_, index) => index)
    .filter((index) => isVisible(index))

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="hidden text-xs font-medium uppercase tracking-wide text-gray-500 sm:block">
              {SITE_NAME}
            </p>
            <h1 className="truncate text-sm font-semibold text-gray-900 sm:text-base">
              {sync.exam_title}
            </h1>
            <p className="mt-0.5 truncate text-xs text-gray-500">{displayName}</p>
            {examDescription && (
              <p className="mt-1 hidden line-clamp-2 text-xs text-gray-500 sm:block">
                {examDescription}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500">Kalan süre</p>
            <p className={`text-xl font-semibold sm:text-lg ${timerClass}`}>
              {formatRemainingTime(remainingSeconds)}
            </p>
            <p
              role="status"
              aria-live="polite"
              className={`mt-0.5 text-xs ${
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
        <p role="alert" className="mx-auto mt-4 max-w-3xl px-4 text-sm text-red-700 sm:px-6">
          {error}
        </p>
      )}
      {queueState.rejected > 0 && (
        <p className="mx-auto mt-4 max-w-3xl px-4 text-sm text-red-700 sm:px-6">
          {queueState.rejected} cevap sunucu tarafından kabul edilmedi.
        </p>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            Soru {currentQuestion.sort_order} / {questions.length}
          </p>
          <button
            type="button"
            aria-pressed={currentFlagged}
            onClick={toggleFlag}
            className={`min-h-10 rounded-md border px-3 py-1.5 text-sm ${focusRing} ${
              currentFlagged
                ? 'border-amber-600 bg-amber-50 text-amber-800'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {currentFlagged ? '⚑ İşaretli – kaldır' : '⚐ Sonra dön'}
          </button>
        </div>

        <p className="mb-6 whitespace-pre-line break-words text-base leading-relaxed text-gray-900 sm:mb-8 sm:text-lg [overflow-wrap:anywhere]">
          {currentQuestion.question_text}
        </p>

        <fieldset className="space-y-3" disabled={inputsLocked}>
          <legend className="sr-only">Cevap seçenekleri</legend>
          {currentQuestion.options.map((option) => {
            const selected = currentQuestion.selected_option_id === option.id
            return (
              <label
                key={option.id}
                className={`flex min-h-12 cursor-pointer touch-manipulation items-start gap-3 rounded-md border px-4 py-3 text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 sm:text-base ${
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
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
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
            className={`mt-4 min-h-10 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 ${focusRing}`}
          >
            Cevabı temizle
          </button>
        )}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-3xl">
          <div
            role="group"
            aria-label="Soru filtresi"
            className="mb-3 flex flex-wrap gap-2"
          >
            {(Object.keys(filterLabels) as QuestionFilter[]).map((key) => {
              const count =
                key === 'all'
                  ? questions.length
                  : key === 'blank'
                    ? blankCount
                    : flaggedCount
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium ${focusRing} ${
                    filter === key
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {filterLabels[key]} ({count})
                </button>
              )
            })}
          </div>

          <div
            className="mb-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto overscroll-contain"
            role="group"
            aria-label="Sorular"
          >
            {visibleIndexes.length === 0 ? (
              <p className="text-xs text-gray-500">Bu filtrede soru yok.</p>
            ) : (
              visibleIndexes.map((index) => {
                const question = questions[index]
                const isCurrent = index === currentIndex
                const isAnswered = answeredSet.has(question.id)
                const isFlagged = flagged.has(question.id)
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`relative h-10 min-w-10 touch-manipulation rounded border px-2 text-xs font-medium sm:h-8 sm:min-w-8 ${focusRing} ${
                      isCurrent
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : isAnswered
                          ? 'border-gray-400 bg-gray-100 text-gray-900'
                          : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                    aria-label={`Soru ${question.sort_order}${isAnswered ? ', cevaplandı' : ', boş'}${isFlagged ? ', işaretli' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {question.sort_order}
                    {isFlagged && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500"
                      />
                    )}
                  </button>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={prevIndex === null}
                onClick={() => prevIndex !== null && setCurrentIndex(prevIndex)}
                className={`min-h-11 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 ${focusRing}`}
              >
                Önceki
              </button>
              <button
                type="button"
                disabled={nextIndex === null}
                onClick={() => nextIndex !== null && setCurrentIndex(nextIndex)}
                className={`min-h-11 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 ${focusRing}`}
              >
                Sonraki
              </button>
            </div>

            <button
              ref={finishButtonRef}
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className={`min-h-11 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 ${focusRing}`}
            >
              {isScheduled ? 'Erken bitir' : 'Sınavı bitir'}
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
          aria-describedby="submit-desc"
        >
          <div
            ref={dialogRef}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 id="submit-title" className="text-base font-semibold text-gray-900">
              {isScheduled ? 'Sınavı erken bitir' : 'Sınavı bitir'}
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-gray-200 px-3 py-2">
                <dt className="text-xs text-gray-500">Cevaplanan</dt>
                <dd className="text-lg font-semibold tabular-nums text-gray-900">
                  {answeredSet.size}
                </dd>
              </div>
              <div className="rounded-md border border-gray-200 px-3 py-2">
                <dt className="text-xs text-gray-500">Boş</dt>
                <dd className="text-lg font-semibold tabular-nums text-gray-900">
                  {blankCount}
                </dd>
              </div>
              <div className="rounded-md border border-gray-200 px-3 py-2">
                <dt className="text-xs text-gray-500">İşaretli</dt>
                <dd className="text-lg font-semibold tabular-nums text-gray-900">
                  {flaggedCount}
                </dd>
              </div>
              <div
                className={`rounded-md border px-3 py-2 ${
                  queueState.unsaved > 0 ? 'border-red-300' : 'border-gray-200'
                }`}
              >
                <dt className="text-xs text-gray-500">Kaydedilmemiş</dt>
                <dd
                  className={`text-lg font-semibold tabular-nums ${
                    queueState.unsaved > 0 ? 'text-red-700' : 'text-gray-900'
                  }`}
                >
                  {queueState.unsaved}
                </dd>
              </div>
            </dl>
            <p id="submit-desc" className="mt-4 text-sm text-gray-600">
              {isScheduled
                ? 'Sınavı bitirdiğinizde cevaplarınızı artık değiştiremezsiniz. Devam etmek istiyor musunuz?'
                : 'Bitirdiğinizde cevaplarınızı artık değiştiremezsiniz. Bitirmeden önce bekleyen kayıtlar tamamlanır.'}
            </p>
            {unsavedAtSubmit > 0 && (
              <p role="alert" className="mt-3 text-sm text-red-700">
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
                className={`min-h-11 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
              >
                Vazgeç
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleSubmit()}
                disabled={submitting}
                className={`min-h-11 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 ${focusRing}`}
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
                  className={`min-h-11 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 ${focusRing}`}
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
