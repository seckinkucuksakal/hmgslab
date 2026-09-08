import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { routes } from '../../lib/routes'
import type { Subject, Topic } from '../../types/question-bank'
import {
  difficultyLabels,
  emptyQuestionForm,
  formValuesToOptionsPayload,
  OPTION_KEYS,
  retainBulkEntryFields,
  validateQuestionFormFields,
  type QuestionFormFieldErrors,
  type QuestionFormValues,
} from '../../lib/question-form'

const selectClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'
const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500'
const labelClass = 'mb-1.5 block text-sm text-gray-700'
const fieldErrorClass = 'mt-1 text-xs text-red-600'

type AdminQuestionFormProps = {
  questionId?: string
}

export function AdminQuestionForm({ questionId }: AdminQuestionFormProps) {
  const isEditing = Boolean(questionId)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const [values, setValues] = useState<QuestionFormValues>(emptyQuestionForm())
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<QuestionFormFieldErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, name, slug, sort_order, is_active, created_at')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setSubjects(data ?? []))

    supabase
      .from('topics')
      .select('id, subject_id, name, slug, sort_order, is_active, created_at')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setTopics(data ?? []))
  }, [])

  useEffect(() => {
    if (!questionId) return

    setLoading(true)

    Promise.all([
      supabase.from('questions').select('*').eq('id', questionId).single(),
      supabase
        .from('question_options')
        .select('*')
        .eq('question_id', questionId)
        .order('sort_order', { ascending: true }),
    ]).then(([questionResult, optionsResult]) => {
      if (questionResult.error || !questionResult.data) {
        setGeneralError('Soru yüklenemedi.')
        setLoading(false)
        return
      }

      const question = questionResult.data
      const options = optionsResult.data ?? []
      const correct = options.find((option) => option.is_correct)
      const optionMap = emptyQuestionForm().options

      for (const option of options) {
        const key = option.option_key as keyof typeof optionMap
        if (OPTION_KEYS.includes(key)) {
          optionMap[key] = option.option_text
        }
      }

      setValues({
        subjectId: question.subject_id,
        topicId: question.topic_id,
        questionText: question.question_text,
        explanation: question.explanation ?? '',
        difficulty: question.difficulty,
        isActive: question.is_active,
        options: optionMap,
        correctOption:
          (correct?.option_key as QuestionFormValues['correctOption']) ?? 'A',
      })
      setLoading(false)
    })
  }, [questionId])

  useEffect(() => {
    if (!isEditing && !loading) {
      questionRef.current?.focus()
    }
  }, [isEditing, loading])

  const filteredTopics = topics.filter(
    (topic) => topic.subject_id === values.subjectId,
  )

  const handleSubjectChange = (subjectId: string) => {
    setValues((current) => ({
      ...current,
      subjectId,
      topicId: topics.some(
        (topic) => topic.id === current.topicId && topic.subject_id === subjectId,
      )
        ? current.topicId
        : '',
    }))
  }

  const saveQuestion = useCallback(
    async (saveAndNew: boolean) => {
      setGeneralError(null)
      setSuccess(null)
      setSubmitAttempted(true)

      const errors = validateQuestionFormFields(values)
      setFieldErrors(errors)

      if (Object.keys(errors).length > 0) return

      setSaving(true)
      const payload = formValuesToOptionsPayload(values)

      if (isEditing && questionId) {
        const { error: updateError } = await supabase.rpc('admin_update_question', {
          p_question_id: questionId,
          p_subject_id: values.subjectId,
          p_topic_id: values.topicId,
          p_question_text: values.questionText.trim(),
          p_explanation: values.explanation.trim() || null,
          p_difficulty: values.difficulty,
          p_is_active: values.isActive,
          p_options: payload,
        })

        setSaving(false)

        if (updateError) {
          setGeneralError(getAdminErrorMessage(updateError))
          return
        }

        setSuccess('Soru kaydedildi.')
        return
      }

      const { error: createError } = await supabase.rpc('admin_create_question', {
        p_subject_id: values.subjectId,
        p_topic_id: values.topicId,
        p_question_text: values.questionText.trim(),
        p_explanation: values.explanation.trim() || null,
        p_difficulty: values.difficulty,
        p_is_active: values.isActive,
        p_options: payload,
      })

      setSaving(false)

      if (createError) {
        setGeneralError(getAdminErrorMessage(createError))
        return
      }

      if (saveAndNew) {
        setValues(retainBulkEntryFields(values))
        setSubmitAttempted(false)
        setFieldErrors({})
        setSuccess('Soru kaydedildi. Yeni soru girebilirsiniz.')
        requestAnimationFrame(() => questionRef.current?.focus())
        return
      }

      setSuccess('Soru kaydedildi.')
      setValues(emptyQuestionForm())
      setSubmitAttempted(false)
      setFieldErrors({})
    },
    [isEditing, questionId, values],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        if (!saving) saveQuestion(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveQuestion, saving])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveQuestion(false)
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={handleSubmit}>
        <div className="mb-8 flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {isEditing ? 'Soruyu Düzenle' : 'Yeni Soru'}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {isEditing
                ? 'Soru metni, seçenekler ve açıklamayı güncelleyin.'
                : 'Soru bankasına yeni bir soru ekleyin.'}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {!isEditing && (
              <button
                type="button"
                disabled={saving}
                onClick={() => saveQuestion(true)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Kaydet ve Yeni Soru
              </button>
            )}
          </div>
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

        <section className="mb-10">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="subject" className={labelClass}>
                Ders
              </label>
              <select
                id="subject"
                value={values.subjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Seçin</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {submitAttempted && fieldErrors.subjectId && (
                <p className={fieldErrorClass}>{fieldErrors.subjectId}</p>
              )}
            </div>

            <div>
              <label htmlFor="topic" className={labelClass}>
                Konu
              </label>
              <select
                id="topic"
                value={values.topicId}
                onChange={(e) =>
                  setValues((current) => ({ ...current, topicId: e.target.value }))
                }
                className={selectClass}
                disabled={!values.subjectId}
              >
                <option value="">Seçin</option>
                {filteredTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
              {submitAttempted && fieldErrors.topicId && (
                <p className={fieldErrorClass}>{fieldErrors.topicId}</p>
              )}
            </div>

            <div>
              <label htmlFor="difficulty" className={labelClass}>
                Zorluk
              </label>
              <select
                id="difficulty"
                value={values.difficulty}
                onChange={(e) =>
                  setValues((current) => ({
                    ...current,
                    difficulty: e.target.value as QuestionFormValues['difficulty'],
                  }))
                }
                className={selectClass}
              >
                {Object.entries(difficultyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {submitAttempted && fieldErrors.difficulty && (
                <p className={fieldErrorClass}>{fieldErrors.difficulty}</p>
              )}
            </div>
          </div>
        </section>

        <section className="mb-10">
          <label htmlFor="questionText" className="mb-2 block text-sm font-medium text-gray-900">
            Soru metni
          </label>
          <textarea
            ref={questionRef}
            id="questionText"
            rows={6}
            value={values.questionText}
            onChange={(e) =>
              setValues((current) => ({ ...current, questionText: e.target.value }))
            }
            placeholder="Soru metnini buraya yazın…"
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base leading-relaxed outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
          />
          {submitAttempted && fieldErrors.questionText && (
            <p className={fieldErrorClass}>{fieldErrors.questionText}</p>
          )}
        </section>

        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-900">Seçenekler</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Doğru cevabı soldaki düğme ile işaretleyin.
            </p>
          </div>

          <ul className="space-y-2">
            {OPTION_KEYS.map((key) => {
              const isCorrect = values.correctOption === key
              return (
                <li key={key}>
                  <label
                    htmlFor={`option-${key}`}
                    className={`flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors ${
                      isCorrect
                        ? 'border-gray-400 bg-gray-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 pt-2">
                      <input
                        type="radio"
                        name="correctOption"
                        value={key}
                        checked={isCorrect}
                        onChange={() =>
                          setValues((current) => ({
                            ...current,
                            correctOption: key,
                          }))
                        }
                        className="text-gray-900 focus:ring-gray-500"
                        aria-label={`${key} doğru cevap`}
                      />
                      <span className="w-4 text-sm font-medium text-gray-700">{key}</span>
                    </span>
                    <input
                      id={`option-${key}`}
                      value={values.options[key]}
                      onChange={(e) =>
                        setValues((current) => ({
                          ...current,
                          options: { ...current.options, [key]: e.target.value },
                        }))
                      }
                      placeholder={`${key} seçeneği`}
                      className="min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-sm outline-none focus:ring-0"
                    />
                  </label>
                </li>
              )
            })}
          </ul>
          {submitAttempted && fieldErrors.options && (
            <p className={`${fieldErrorClass} mt-2`}>{fieldErrors.options}</p>
          )}
        </section>

        <section className="mb-10">
          <label htmlFor="explanation" className={labelClass}>
            Çözüm / Açıklama
          </label>
          <textarea
            id="explanation"
            rows={3}
            value={values.explanation}
            onChange={(e) =>
              setValues((current) => ({ ...current, explanation: e.target.value }))
            }
            placeholder="İsteğe bağlı — sınav sonrası gösterilecek açıklama"
            className={`${inputClass} text-gray-700`}
          />
        </section>

        <section className="mb-10 flex items-center gap-6 text-sm text-gray-600">
          <span>Durum</span>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              checked={values.isActive}
              onChange={() => setValues((current) => ({ ...current, isActive: true }))}
              className="text-gray-900 focus:ring-gray-500"
            />
            Aktif
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="status"
              checked={!values.isActive}
              onChange={() => setValues((current) => ({ ...current, isActive: false }))}
              className="text-gray-900 focus:ring-gray-500"
            />
            Pasif
          </label>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
          {!isEditing && (
            <button
              type="button"
              disabled={saving}
              onClick={() => saveQuestion(true)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Kaydet ve Yeni Soru
            </button>
          )}
          <Link
            to={routes.yonetimSorular}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Listeye dön
          </Link>
          {!isEditing && (
            <span className="ml-auto hidden text-xs text-gray-400 sm:inline">
              ⌘S / Ctrl+S ile kaydet
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
