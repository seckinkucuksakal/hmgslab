import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { routes } from '../../lib/routes'
import { difficultyLabels } from '../../lib/question-form'
import type { QuestionListRow } from '../../lib/question-search'
import { useQuestionSearch } from '../../hooks/useQuestionSearch'
import { QuestionListStatus, QuestionPager } from '../../components/admin/QuestionPager'
import { fetchSubjects, subjectOptionLabel } from '../../lib/subject-catalog'
import type { Subject, Topic } from '../../types/question-bank'

type QuestionRow = QuestionListRow

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'

export function AdminQuestionsPage() {
  const navigate = useNavigate()
  const list = useQuestionSearch()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetchSubjects().catch(() => [] as Subject[]),
      supabase
        .from('topics')
        .select('id, subject_id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
    ]).then(([loadedSubjects, topicsResult]) => {
      setSubjects(loadedSubjects)
      setTopics(topicsResult.data ?? [])
    })
  }, [])

  const filteredTopics = useMemo(
    () =>
      list.subjectId
        ? topics.filter((topic) => topic.subject_id === list.subjectId)
        : topics,
    [topics, list.subjectId],
  )

  const handleArchiveToggle = async (
    event: MouseEvent,
    question: QuestionRow,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    if (togglingId) return
    setTogglingId(question.id)

    const { error: updateError } = await supabase
      .from('questions')
      .update({ is_active: !question.is_active })
      .eq('id', question.id)

    if (updateError) {
      setError(getAdminErrorMessage(updateError))
      setTogglingId(null)
      return
    }

    list.reload()
    setTogglingId(null)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sorular</h1>
          <p className="mt-1 text-sm text-gray-600">
            Soru bankasındaki tüm soruları yönetin.
          </p>
        </div>
        <Link
          to={routes.yonetimSoruYeni}
          className="rounded-md bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-400"
        >
          Yeni Soru
        </Link>
      </div>

      <div className="mt-6 grid gap-3 border-y border-gray-200 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          placeholder="Ara…"
          value={list.search}
          onChange={(e) => list.setSearch(e.target.value)}
          className={inputClass}
        />
        <select
          value={list.subjectId}
          onChange={(e) => list.setSubjectId(e.target.value)}
          className={inputClass}
        >
          <option value="">Tüm dersler</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subjectOptionLabel(subject)}
            </option>
          ))}
        </select>
        <select
          value={list.topicId}
          onChange={(e) => list.setTopicId(e.target.value)}
          className={inputClass}
        >
          <option value="">Tüm konular</option>
          {filteredTopics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
        <select
          value={list.difficulty}
          onChange={(e) => list.setDifficulty(e.target.value)}
          className={inputClass}
        >
          <option value="">Tüm zorluklar</option>
          {Object.entries(difficultyLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={list.active}
          onChange={(e) =>
            list.setActive(e.target.value as 'all' | 'active' | 'inactive')
          }
          className={inputClass}
        >
          <option value="all">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <QuestionListStatus state={list} />

      {list.loading && list.rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : list.failed ? null : list.rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          {list.total === 0 && (list.search || list.subjectId || list.topicId || list.difficulty || list.active !== 'all')
            ? 'Bu filtrelerle eşleşen soru bulunamadı.'
            : 'Soru bulunamadı.'}
        </p>
      ) : (
        <ul className={`mt-2 divide-y divide-gray-200 ${list.loading ? 'opacity-60' : ''}`}>
          {list.rows.map((question) => (
            <li key={question.id}>
              <Link
                to={routes.yonetimSoruDuzenle(question.id)}
                className="group block py-4 transition-colors hover:bg-gray-50/80"
              >
                <p className="line-clamp-2 text-sm leading-relaxed text-gray-900 group-hover:text-gray-950">
                  {question.question_text}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>
                    {question.subjects?.name ?? '—'}
                    {subjects.find((s) => s.id === question.subject_id)?.is_standard ===
                      false && (
                      <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                        kapsam dışı
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{question.topics?.name ?? '—'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{difficultyLabels[question.difficulty]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{question.is_active ? 'Aktif' : 'Pasif'}</span>
                </div>
              </Link>
              <div className="flex gap-4 pb-3 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    navigate(routes.yonetimSoruDuzenle(question.id))
                  }
                  className="text-gray-900 hover:underline"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={(event) => handleArchiveToggle(event, question)}
                  disabled={togglingId !== null}
                  className="text-gray-600 hover:underline disabled:opacity-50"
                >
                  {togglingId === question.id
                    ? 'Kaydediliyor…'
                    : question.is_active
                      ? 'Arşivle'
                      : 'Aktifleştir'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <QuestionPager state={list} />
    </div>
  )
}
