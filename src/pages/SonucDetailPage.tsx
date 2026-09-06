import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getAttemptReview,
  getReviewErrorMessage,
} from '../lib/exam-review'
import {
  getAttemptRanking,
  getRankingErrorMessage,
} from '../lib/exam-ranking'
import { RankingSummary } from '../components/exam/RankingSummary'
import type { AttemptRanking } from '../types/exam-ranking'
import type {
  AttemptReview,
  ReviewFilter,
  ReviewQuestion,
} from '../types/exam-review'
import {
  reviewFilterLabels,
  reviewStatusLabels,
} from '../types/exam-review'

function SubjectPerformanceSection({
  subjects,
}: {
  subjects: AttemptReview['subjects']
}) {
  if (subjects.length === 0) return null

  return (
    <section className="mt-8 border-t border-gray-200 pt-8">
      <h2 className="text-sm font-medium text-gray-900">Ders bazında performans</h2>
      <ul className="mt-4 space-y-4">
        {subjects.map((subject) => (
          <li key={subject.subject_id}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-medium text-gray-900">
                {subject.subject_name}
              </span>
              <span className="shrink-0 text-gray-600">
                %{subject.percent_correct} · {subject.correct}/{subject.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gray-800"
                style={{ width: `${subject.percent_correct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {subject.correct} doğru · {subject.incorrect} yanlış ·{' '}
              {subject.blank} boş
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReviewQuestionView({ question }: { question: ReviewQuestion }) {
  const statusClass =
    question.status === 'correct'
      ? 'text-green-800'
      : question.status === 'incorrect'
        ? 'text-red-800'
        : 'text-gray-600'

  const selectedOption = question.options.find(
    (o) => o.id === question.selected_option_id,
  )
  const correctOption = question.options.find(
    (o) => o.id === question.correct_option_id,
  )

  return (
    <article>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-gray-500">
          Soru {question.sort_order}
          {question.subject_name ? ` · ${question.subject_name}` : ''}
        </p>
        <span className={`text-sm font-medium ${statusClass}`}>
          {reviewStatusLabels[question.status]}
        </span>
      </div>

      <p className="mt-3 text-base leading-relaxed text-gray-900">
        {question.question_text}
      </p>

      <ul className="mt-5 space-y-2">
        {question.options.map((option) => {
          const isSelected = option.id === question.selected_option_id
          const isCorrect = option.id === question.correct_option_id

          let borderClass = 'border-gray-200'
          if (isCorrect) borderClass = 'border-green-300 bg-green-50/50'
          else if (isSelected && !isCorrect)
            borderClass = 'border-red-300 bg-red-50/50'

          return (
            <li
              key={option.id}
              className={`rounded-md border px-4 py-2.5 text-sm ${borderClass}`}
            >
              <span className="font-medium text-gray-700">
                {option.option_key}.
              </span>{' '}
              {option.option_text}
              {isSelected && (
                <span className="ml-2 text-xs text-gray-500">
                  (Sizin cevabınız)
                </span>
              )}
              {isCorrect && (
                <span className="ml-2 text-xs text-green-700">
                  (Doğru cevap)
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-1 text-sm text-gray-600">
        <p>
          <span className="text-gray-500">Seçiminiz:</span>{' '}
          {selectedOption
            ? `${selectedOption.option_key}. ${selectedOption.option_text}`
            : 'Boş'}
        </p>
        <p>
          <span className="text-gray-500">Doğru cevap:</span>{' '}
          {correctOption
            ? `${correctOption.option_key}. ${correctOption.option_text}`
            : '—'}
        </p>
      </div>

      {question.explanation && (
        <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Açıklama
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {question.explanation}
          </p>
        </div>
      )}
    </article>
  )
}

export function SonucDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [review, setReview] = useState<AttemptReview | null>(null)
  const [ranking, setRanking] = useState<AttemptRanking | null>(null)
  const [rankingError, setRankingError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (!attemptId) return

    getAttemptReview(attemptId)
      .then(setReview)
      .catch((err) => setError(getReviewErrorMessage(err)))
      .finally(() => setLoading(false))

    getAttemptRanking(attemptId)
      .then(setRanking)
      .catch((err) => setRankingError(getRankingErrorMessage(err)))
  }, [attemptId])

  const filteredQuestions = useMemo(() => {
    if (!review) return []
    if (filter === 'all') return review.questions
    return review.questions.filter((q) => q.status === filter)
  }, [filter, review])

  useEffect(() => {
    setCurrentIndex(0)
  }, [filter])

  const currentQuestion = filteredQuestions[currentIndex]

  if (loading) {
    return <p className="text-sm text-gray-500">Sonuç yükleniyor…</p>
  }

  if (error || !review) {
    return (
      <div>
        <p className="text-sm text-red-700">
          {error ?? 'Sonuç bulunamadı.'}
        </p>
        <Link
          to="/sonuclar"
          className="mt-4 inline-block text-sm text-gray-600 hover:text-gray-900"
        >
          Sonuçlara dön
        </Link>
      </div>
    )
  }

  const { attempt } = review
  const completionPercent =
    attempt.total_questions > 0
      ? Math.round((attempt.correct_count / attempt.total_questions) * 100)
      : 0

  return (
    <div>
      <Link
        to="/sonuclar"
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        ← Sonuçlar
      </Link>

      <header className="mt-4 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {attempt.exam_title}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {attempt.submitted_at
            ? new Date(attempt.submitted_at).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
          {attempt.status === 'expired' ? ' · Süre doldu' : ''}
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-4 sm:max-w-md">
          <div>
            <dt className="text-xs text-gray-500">Doğru</dt>
            <dd className="text-xl font-semibold text-gray-900">
              {attempt.correct_count}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Yanlış</dt>
            <dd className="text-xl font-semibold text-gray-900">
              {attempt.incorrect_count}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Boş</dt>
            <dd className="text-xl font-semibold text-gray-900">
              {attempt.blank_count}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-gray-500">
          {attempt.total_questions} soru · %{completionPercent} doğru
        </p>
      </header>

      {rankingError && (
        <p className="mt-4 text-sm text-gray-600">{rankingError}</p>
      )}

      {ranking && (
        <RankingSummary
          ranking={ranking}
          leaderboardHref={`/denemeler/${ranking.exam_id}/siralama`}
        />
      )}

      <SubjectPerformanceSection subjects={review.subjects} />

      <section className="mt-10 border-t border-gray-200 pt-8">
        <h2 className="text-sm font-medium text-gray-900">Cevap incelemesi</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(reviewFilterLabels) as ReviewFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                filter === key
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {reviewFilterLabels[key]}
            </button>
          ))}
        </div>

        {filteredQuestions.length === 0 ? (
          <p className="mt-6 text-sm text-gray-600">
            Bu filtreye uygun soru bulunmuyor.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {filteredQuestions.map((question, index) => {
                const isCurrent = index === currentIndex
                const statusDot =
                  question.status === 'correct'
                    ? 'bg-green-600'
                    : question.status === 'incorrect'
                      ? 'bg-red-600'
                      : 'bg-gray-300'

                return (
                  <button
                    key={question.question_id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded border px-2 text-xs font-medium ${
                      isCurrent
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {!isCurrent && (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusDot}`}
                        aria-hidden="true"
                      />
                    )}
                    {question.sort_order}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 border-y border-gray-200 py-8">
              {currentQuestion && (
                <ReviewQuestionView question={currentQuestion} />
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Önceki
              </button>
              <span className="text-xs text-gray-500">
                {currentIndex + 1} / {filteredQuestions.length}
              </span>
              <button
                type="button"
                disabled={currentIndex >= filteredQuestions.length - 1}
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
