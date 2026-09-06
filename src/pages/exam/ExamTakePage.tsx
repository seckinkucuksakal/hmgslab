import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getExamErrorMessage,
  loadExamSessionQuestions,
  saveAttemptAnswer,
  submitExamAttempt,
  syncExamAttempt,
} from '../../lib/exam-session'
import type { AttemptSync, ExamSessionQuestion } from '../../types/exam-attempt'
import { formatRemainingTime } from '../../types/exam-attempt'

export function ExamTakePage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()

  const [sync, setSync] = useState<AttemptSync | null>(null)
  const [questions, setQuestions] = useState<ExamSessionQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  const syncAnchorRef = useRef<{ at: number; seconds: number } | null>(null)

  const applySync = useCallback((next: AttemptSync) => {
    setSync(next)
    syncAnchorRef.current = {
      at: Date.now(),
      seconds: next.remaining_seconds,
    }
    setRemainingSeconds(next.remaining_seconds)
  }, [])

  const loadSession = useCallback(async () => {
    if (!attemptId) return

    setError(null)

    try {
      const nextSync = await syncExamAttempt(attemptId)
      applySync(nextSync)

      if (nextSync.status !== 'in_progress') {
        navigate(`/sonuclar/${attemptId}`, { replace: true })
        return
      }

      const loadedQuestions = await loadExamSessionQuestions(attemptId)
      setQuestions(loadedQuestions)
      setLoading(false)
    } catch (err) {
      setError(getExamErrorMessage(err))
      setLoading(false)
    }
  }, [applySync, attemptId, navigate])

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

      if (next === 0) {
        syncExamAttempt(attemptId!)
          .then((expiredSync) => {
            applySync(expiredSync)
            if (expiredSync.status !== 'in_progress') {
              navigate(`/sonuclar/${attemptId}`, { replace: true })
            }
          })
          .catch(() => {})
      }
    }, 1000)

    return () => window.clearInterval(tick)
  }, [applySync, attemptId, navigate, sync])

  useEffect(() => {
    if (!attemptId || !sync || sync.status !== 'in_progress') return

    const resync = window.setInterval(() => {
      syncExamAttempt(attemptId)
        .then((nextSync) => {
          applySync(nextSync)
          if (nextSync.status !== 'in_progress') {
            navigate(`/sonuclar/${attemptId}`, { replace: true })
          }
        })
        .catch(() => {})
    }, 60_000)

    return () => window.clearInterval(resync)
  }, [applySync, attemptId, navigate, sync])

  const currentQuestion = questions[currentIndex]

  const answeredSet = new Set(
    questions
      .filter((q) => q.selected_option_id)
      .map((q) => q.id),
  )

  const blankCount = questions.length - answeredSet.size

  const handleSelectOption = async (optionId: string) => {
    if (!attemptId || !currentQuestion || submitting) return

    setSavingQuestionId(currentQuestion.id)
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === currentQuestion.id
          ? { ...q, selected_option_id: optionId }
          : q,
      ),
    )

    try {
      await saveAttemptAnswer(attemptId, currentQuestion.id, optionId)
    } catch (err) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === currentQuestion.id
            ? {
                ...q,
                selected_option_id: currentQuestion.selected_option_id,
              }
            : q,
        ),
      )
      setError(getExamErrorMessage(err))
    } finally {
      setSavingQuestionId(null)
    }
  }

  const handleClearAnswer = async () => {
    if (!attemptId || !currentQuestion || submitting) return

    const previous = currentQuestion.selected_option_id
    setSavingQuestionId(currentQuestion.id)
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === currentQuestion.id
          ? { ...q, selected_option_id: null }
          : q,
      ),
    )

    try {
      await saveAttemptAnswer(attemptId, currentQuestion.id, null)
    } catch (err) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === currentQuestion.id
            ? { ...q, selected_option_id: previous }
            : q,
        ),
      )
      setError(getExamErrorMessage(err))
    } finally {
      setSavingQuestionId(null)
    }
  }

  const handleSubmit = async () => {
    if (!attemptId) return

    setSubmitting(true)
    setError(null)

    try {
      await submitExamAttempt(attemptId)
      navigate(`/sonuclar/${attemptId}`, { replace: true })
    } catch (err) {
      setError(getExamErrorMessage(err))
      setSubmitting(false)
      setShowConfirm(false)
    }
  }

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
    remainingSeconds <= 300 ? 'text-red-700 tabular-nums' : 'text-gray-900 tabular-nums'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              HMGS
            </p>
            <h1 className="truncate text-base font-semibold text-gray-900">
              {sync.exam_title}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Kalan süre</p>
            <p className={`text-lg font-semibold ${timerClass}`}>
              {formatRemainingTime(remainingSeconds)}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <p className="mx-auto mt-4 max-w-3xl px-4 text-sm text-red-700 sm:px-6">
          {error}
        </p>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <p className="mb-4 text-sm text-gray-500">
          Soru {currentQuestion.sort_order} / {questions.length}
        </p>

        <p className="mb-8 text-base leading-relaxed text-gray-900 sm:text-lg">
          {currentQuestion.question_text}
        </p>

        <fieldset className="space-y-3" disabled={Boolean(savingQuestionId)}>
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
            disabled={Boolean(savingQuestionId)}
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
              Sınavı bitir
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
              Sınavı bitir
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {blankCount > 0
                ? `${blankCount} soruyu boş bıraktınız. Sınavı bitirmek istediğinize emin misiniz?`
                : 'Sınavı bitirmek istediğinize emin misiniz?'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? 'Gönderiliyor…' : 'Evet, bitir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
