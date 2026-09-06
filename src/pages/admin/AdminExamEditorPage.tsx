import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { difficultyLabels } from '../../lib/question-form'
import {
  validateExamForm,
  type ExamFormErrors,
  type ExamFormValues,
} from '../../types/exam'
import type { Difficulty, Subject, Topic } from '../../types/question-bank'

type BankQuestion = {
  id: string
  question_text: string
  difficulty: Difficulty
  subject_id: string
  topic_id: string
  subjects: { name: string } | null
  topics: { name: string } | null
}

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'
const labelClass = 'mb-1.5 block text-sm text-gray-700'
const fieldErrorClass = 'mt-1 text-xs text-red-600'
const filterClass =
  'rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'

type AdminExamEditorPageProps = {
  examId?: string
}

export function AdminExamEditorPage({ examId }: AdminExamEditorPageProps) {
  const navigate = useNavigate()
  const isEditing = Boolean(examId)

  const [values, setValues] = useState<ExamFormValues>({
    title: '',
    description: '',
    durationMinutes: 120,
    isActive: false,
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<ExamFormErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')

  useEffect(() => {
    Promise.all([
      supabase
        .from('questions')
        .select(
          'id, question_text, difficulty, subject_id, topic_id, subjects(name), topics(name)',
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('subjects')
        .select('id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
      supabase
        .from('topics')
        .select('id, subject_id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
    ]).then(([questionsResult, subjectsResult, topicsResult]) => {
      setBankQuestions(
        (questionsResult.data ?? []).map((row) => ({
          ...row,
          subjects: Array.isArray(row.subjects) ? row.subjects[0] : row.subjects,
          topics: Array.isArray(row.topics) ? row.topics[0] : row.topics,
        })) as BankQuestion[],
      )
      setSubjects(subjectsResult.data ?? [])
      setTopics(topicsResult.data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!examId) return

    setLoading(true)

    Promise.all([
      supabase.from('exams').select('*').eq('id', examId).single(),
      supabase
        .from('exam_questions')
        .select('question_id, sort_order')
        .eq('exam_id', examId)
        .order('sort_order', { ascending: true }),
    ]).then(async ([examResult, linksResult]) => {
      if (examResult.error || !examResult.data) {
        setGeneralError('Deneme yüklenemedi.')
        setLoading(false)
        return
      }

      const exam = examResult.data
      const ids = (linksResult.data ?? []).map((row) => row.question_id)

      setValues({
        title: exam.title,
        description: exam.description ?? '',
        durationMinutes: exam.duration_minutes,
        isActive: exam.is_active,
      })
      setSelectedIds(ids)

      if (ids.length > 0) {
        const { data: linkedQuestions } = await supabase
          .from('questions')
          .select(
            'id, question_text, difficulty, subject_id, topic_id, subjects(name), topics(name)',
          )
          .in('id', ids)

        if (linkedQuestions) {
          setBankQuestions((current) => {
            const map = new Map(current.map((q) => [q.id, q]))
            for (const row of linkedQuestions) {
              map.set(row.id, {
                ...row,
                subjects: Array.isArray(row.subjects) ? row.subjects[0] : row.subjects,
                topics: Array.isArray(row.topics) ? row.topics[0] : row.topics,
              } as BankQuestion)
            }
            return Array.from(map.values())
          })
        }
      }

      setLoading(false)
    })
  }, [examId])

  const filteredTopics = useMemo(
    () =>
      subjectFilter
        ? topics.filter((topic) => topic.subject_id === subjectFilter)
        : topics,
    [topics, subjectFilter],
  )

  const filteredBank = useMemo(() => {
    return bankQuestions.filter((question) => {
      if (subjectFilter && question.subject_id !== subjectFilter) return false
      if (topicFilter && question.topic_id !== topicFilter) return false
      if (difficultyFilter && question.difficulty !== difficultyFilter) return false
      if (search.trim()) {
        const term = search.trim().toLocaleLowerCase('tr')
        if (!question.question_text.toLocaleLowerCase('tr').includes(term)) {
          return false
        }
      }
      return true
    })
  }, [bankQuestions, subjectFilter, topicFilter, difficultyFilter, search])

  const selectedQuestions = useMemo(() => {
    const map = new Map(bankQuestions.map((q) => [q.id, q]))
    return selectedIds
      .map((id) => map.get(id))
      .filter((q): q is BankQuestion => Boolean(q))
  }, [bankQuestions, selectedIds])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggleQuestion = (questionId: string) => {
    setSelectedIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId],
    )
  }

  const removeQuestion = (questionId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== questionId))
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= selectedIds.length) return

    setSelectedIds((current) => {
      const next = [...current]
      const temp = next[index]
      next[index] = next[target]
      next[target] = temp
      return next
    })
  }

  const saveExam = useCallback(async () => {
    setGeneralError(null)
    setSuccess(null)
    setSubmitAttempted(true)

    const errors = validateExamForm(values, selectedIds)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)

    const examPayload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      duration_minutes: values.durationMinutes,
      is_active: values.isActive,
    }

    let targetExamId = examId

    if (isEditing && examId) {
      const { error: updateError } = await supabase
        .from('exams')
        .update(examPayload)
        .eq('id', examId)

      if (updateError) {
        setSaving(false)
        setGeneralError(getAdminErrorMessage(updateError))
        return
      }
    } else {
      const { data: created, error: createError } = await supabase
        .from('exams')
        .insert(examPayload)
        .select('id')
        .single()

      if (createError || !created) {
        setSaving(false)
        setGeneralError(getAdminErrorMessage(createError))
        return
      }

      targetExamId = created.id
    }

    const { error: deleteError } = await supabase
      .from('exam_questions')
      .delete()
      .eq('exam_id', targetExamId!)

    if (deleteError) {
      setSaving(false)
      setGeneralError(getAdminErrorMessage(deleteError))
      return
    }

    const links = selectedIds.map((questionId, index) => ({
      exam_id: targetExamId!,
      question_id: questionId,
      sort_order: index + 1,
    }))

    const { error: insertError } = await supabase.from('exam_questions').insert(links)

    setSaving(false)

    if (insertError) {
      setGeneralError(getAdminErrorMessage(insertError))
      return
    }

    setSuccess('Deneme kaydedildi.')
    setSubmitAttempted(false)
    setFieldErrors({})

    if (!isEditing && targetExamId) {
      navigate(`/admin/denemeler/${targetExamId}`, { replace: true })
    }
  }, [examId, isEditing, navigate, selectedIds, values])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        if (!saving) saveExam()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveExam, saving])

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isEditing ? 'Denemeyi Düzenle' : 'Yeni Deneme'}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Soru bankasından soru seçerek deneme oluşturun.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={saveExam}
          className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      {generalError && (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {generalError}
        </p>
      )}
      {success && (
        <p className="mb-6 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <section className="mb-10 space-y-4">
        <div>
          <label htmlFor="title" className={labelClass}>
            Deneme adı
          </label>
          <input
            id="title"
            value={values.title}
            onChange={(e) => setValues((c) => ({ ...c, title: e.target.value }))}
            className={inputClass}
            placeholder="Örn. HMGS Deneme 1"
          />
          {submitAttempted && fieldErrors.title && (
            <p className={fieldErrorClass}>{fieldErrors.title}</p>
          )}
        </div>

        <div>
          <label htmlFor="description" className={labelClass}>
            Açıklama
          </label>
          <textarea
            id="description"
            rows={2}
            value={values.description}
            onChange={(e) =>
              setValues((c) => ({ ...c, description: e.target.value }))
            }
            className={inputClass}
            placeholder="İsteğe bağlı"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="duration" className={labelClass}>
              Süre (dakika)
            </label>
            <input
              id="duration"
              type="number"
              min={1}
              value={values.durationMinutes}
              onChange={(e) =>
                setValues((c) => ({
                  ...c,
                  durationMinutes: Number(e.target.value),
                }))
              }
              className={inputClass}
            />
            {submitAttempted && fieldErrors.durationMinutes && (
              <p className={fieldErrorClass}>{fieldErrors.durationMinutes}</p>
            )}
          </div>

          <div className="flex items-end gap-6 pb-2 text-sm text-gray-600">
            <span>Durum</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="examStatus"
                checked={values.isActive}
                onChange={() => setValues((c) => ({ ...c, isActive: true }))}
              />
              Aktif
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="examStatus"
                checked={!values.isActive}
                onChange={() => setValues((c) => ({ ...c, isActive: false }))}
              />
              Pasif
            </label>
          </div>
        </div>
      </section>

      <section className="mb-10 border-t border-gray-200 pt-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-900">
            Seçili sorular ({selectedIds.length})
          </h2>
          {submitAttempted && fieldErrors.questions && (
            <p className={fieldErrorClass}>{fieldErrors.questions}</p>
          )}
        </div>

        {selectedQuestions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Henüz soru eklenmedi. Aşağıdan soru bankasına göz atın.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {selectedQuestions.map((question, index) => (
              <li
                key={question.id}
                className="flex items-start gap-3 py-3 text-sm"
              >
                <span className="mt-0.5 w-6 shrink-0 text-gray-400">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-gray-900">
                    {question.question_text}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {question.subjects?.name ?? '—'} ·{' '}
                    {question.topics?.name ?? '—'} ·{' '}
                    {difficultyLabels[question.difficulty]}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    aria-label="Yukarı taşı"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === selectedQuestions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    aria-label="Aşağı taşı"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(question.id)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Kaldır
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-gray-200 pt-8">
        <h2 className="mb-4 text-sm font-medium text-gray-900">Soru bankası</h2>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            placeholder="Ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={filterClass}
          />
          <select
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value)
              setTopicFilter('')
            }}
            className={filterClass}
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
            className={filterClass}
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
            className={filterClass}
          >
            <option value="">Tüm zorluklar</option>
            {Object.entries(difficultyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {filteredBank.length === 0 ? (
          <p className="text-sm text-gray-500">Soru bulunamadı.</p>
        ) : (
          <ul className="divide-y divide-gray-200 border-y border-gray-200">
            {filteredBank.map((question) => {
              const isSelected = selectedSet.has(question.id)
              return (
                <li
                  key={question.id}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-gray-900">
                      {question.question_text}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {question.subjects?.name ?? '—'} ·{' '}
                      {question.topics?.name ?? '—'} ·{' '}
                      {difficultyLabels[question.difficulty]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleQuestion(question.id)}
                    className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium ${
                      isSelected
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {isSelected ? 'Eklendi' : 'Ekle'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6">
        <button
          type="button"
          disabled={saving}
          onClick={saveExam}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <Link
          to="/admin/denemeler"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Listeye dön
        </Link>
        <span className="ml-auto hidden text-xs text-gray-400 sm:inline">
          ⌘S / Ctrl+S ile kaydet
        </span>
      </div>
    </div>
  )
}
