import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { routes } from '../../lib/routes'
import {
  QUESTION_BANK_FETCH_LIMIT,
  difficultyLabels,
} from '../../lib/question-form'
import type { Subject, Topic } from '../../types/question-bank'
import type { Difficulty } from '../../types/question-bank'

type QuestionRow = {
  id: string
  question_text: string
  difficulty: Difficulty
  is_active: boolean
  created_at: string
  subject_id: string
  topic_id: string
  subjects: { name: string } | null
  topics: { name: string } | null
}

const inputClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'

export function AdminQuestionsPage() {
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const [questionsResult, subjectsResult, topicsResult] = await Promise.all([
      supabase
        .from('questions')
        .select(
          'id, question_text, difficulty, is_active, created_at, subject_id, topic_id, subjects(name), topics(name)',
        )
        .order('created_at', { ascending: false })
        .limit(QUESTION_BANK_FETCH_LIMIT),
      supabase
        .from('subjects')
        .select('id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
      supabase
        .from('topics')
        .select('id, subject_id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
    ])

    if (questionsResult.error) {
      setError(getAdminErrorMessage(questionsResult.error))
      setLoading(false)
      return
    }

    setQuestions(
      (questionsResult.data ?? []).map((row) => ({
        ...row,
        subjects: Array.isArray(row.subjects) ? row.subjects[0] : row.subjects,
        topics: Array.isArray(row.topics) ? row.topics[0] : row.topics,
      })) as QuestionRow[],
    )
    setSubjects(subjectsResult.data ?? [])
    setTopics(topicsResult.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredTopics = useMemo(
    () =>
      subjectFilter
        ? topics.filter((topic) => topic.subject_id === subjectFilter)
        : topics,
    [topics, subjectFilter],
  )

  const filteredQuestions = useMemo(() => {
    return questions.filter((question) => {
      if (subjectFilter && question.subject_id !== subjectFilter) return false
      if (topicFilter && question.topic_id !== topicFilter) return false
      if (difficultyFilter && question.difficulty !== difficultyFilter) return false
      if (activeFilter === 'active' && !question.is_active) return false
      if (activeFilter === 'inactive' && question.is_active) return false
      if (search.trim()) {
        const term = search.trim().toLocaleLowerCase('tr')
        if (!question.question_text.toLocaleLowerCase('tr').includes(term)) {
          return false
        }
      }
      return true
    })
  }, [questions, subjectFilter, topicFilter, difficultyFilter, activeFilter, search])

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

    await loadData()
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
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Yeni Soru
        </Link>
      </div>

      <div className="mt-6 grid gap-3 border-y border-gray-200 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          placeholder="Ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
        <select
          value={subjectFilter}
          onChange={(e) => {
            setSubjectFilter(e.target.value)
            setTopicFilter('')
          }}
          className={inputClass}
        >
          <option value="">Tüm dersler</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
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
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
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
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
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

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : filteredQuestions.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">Soru bulunamadı.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-200">
          {filteredQuestions.map((question) => (
            <li key={question.id}>
              <Link
                to={routes.yonetimSoruDuzenle(question.id)}
                className="group block py-4 transition-colors hover:bg-gray-50/80"
              >
                <p className="line-clamp-2 text-sm leading-relaxed text-gray-900 group-hover:text-gray-950">
                  {question.question_text}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>{question.subjects?.name ?? '—'}</span>
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

      {!loading && questions.length >= QUESTION_BANK_FETCH_LIMIT && (
        <p className="mt-4 text-xs text-gray-500">
          En yeni {QUESTION_BANK_FETCH_LIMIT} soru yüklendi. Daha eski soruları
          görmek için ders ve konu filtrelerini kullanın.
        </p>
      )}
    </div>
  )
}
