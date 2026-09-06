import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { slugify } from '../../lib/slugify'
import type { Subject, Topic } from '../../types/question-bank'

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500'
const labelClass = 'mb-1 block text-sm text-gray-700'

export function AdminCatalogPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [subjectName, setSubjectName] = useState('')
  const [topicSubjectId, setTopicSubjectId] = useState('')
  const [topicName, setTopicName] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [subjectsResult, topicsResult] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
      supabase
        .from('topics')
        .select('id, subject_id, name, slug, sort_order, is_active, created_at')
        .order('sort_order', { ascending: true }),
    ])

    setSubjects(subjectsResult.data ?? [])
    setTopics(topicsResult.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddSubject = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!subjectName.trim()) {
      setError('Ders adı zorunludur.')
      return
    }

    const { error: insertError } = await supabase.from('subjects').insert({
      name: subjectName.trim(),
      slug: slugify(subjectName),
      sort_order: subjects.length + 1,
    })

    if (insertError) {
      setError(getAdminErrorMessage(insertError))
      return
    }

    setSubjectName('')
    setSuccess('Ders eklendi.')
    await loadData()
  }

  const handleAddTopic = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!topicSubjectId) {
      setError('Ders seçimi zorunludur.')
      return
    }
    if (!topicName.trim()) {
      setError('Konu adı zorunludur.')
      return
    }

    const subjectTopics = topics.filter((t) => t.subject_id === topicSubjectId)

    const { error: insertError } = await supabase.from('topics').insert({
      subject_id: topicSubjectId,
      name: topicName.trim(),
      slug: slugify(topicName),
      sort_order: subjectTopics.length + 1,
    })

    if (insertError) {
      setError(getAdminErrorMessage(insertError))
      return
    }

    setTopicName('')
    setSuccess('Konu eklendi.')
    await loadData()
  }

  const toggleSubjectActive = async (subject: Subject) => {
    const { error: updateError } = await supabase
      .from('subjects')
      .update({ is_active: !subject.is_active })
      .eq('id', subject.id)

    if (updateError) {
      setError(getAdminErrorMessage(updateError))
      return
    }

    await loadData()
  }

  const toggleTopicActive = async (topic: Topic) => {
    const { error: updateError } = await supabase
      .from('topics')
      .update({ is_active: !topic.is_active })
      .eq('id', topic.id)

    if (updateError) {
      setError(getAdminErrorMessage(updateError))
      return
    }

    await loadData()
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Yükleniyor…</p>
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dersler ve Konular</h1>
        <p className="mt-1 text-sm text-gray-600">
          Soru bankası kataloğunu yönetin.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={handleAddSubject} className="space-y-3">
          <h2 className="text-base font-medium text-gray-900">Yeni ders</h2>
          <div>
            <label htmlFor="subjectName" className={labelClass}>
              Ders adı
            </label>
            <input
              id="subjectName"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Ders ekle
          </button>
        </form>

        <form onSubmit={handleAddTopic} className="space-y-3">
          <h2 className="text-base font-medium text-gray-900">Yeni konu</h2>
          <div>
            <label htmlFor="topicSubject" className={labelClass}>
              Ders
            </label>
            <select
              id="topicSubject"
              value={topicSubjectId}
              onChange={(e) => setTopicSubjectId(e.target.value)}
              className={inputClass}
            >
              <option value="">Seçin</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="topicName" className={labelClass}>
              Konu adı
            </label>
            <input
              id="topicName"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Konu ekle
          </button>
        </form>
      </div>

      <section>
        <h2 className="text-base font-medium text-gray-900">Mevcut dersler</h2>
        <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
          {subjects.map((subject) => (
            <li
              key={subject.id}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-gray-900">{subject.name}</p>
                <p className="text-gray-500">{subject.slug}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleSubjectActive(subject)}
                className="text-gray-600 hover:underline"
              >
                {subject.is_active ? 'Pasifleştir' : 'Aktifleştir'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-medium text-gray-900">Mevcut konular</h2>
        <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
          {topics.map((topic) => {
            const subject = subjects.find((s) => s.id === topic.subject_id)
            return (
              <li
                key={topic.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{topic.name}</p>
                  <p className="text-gray-500">
                    {subject?.name ?? '—'} · {topic.slug}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTopicActive(topic)}
                  className="text-gray-600 hover:underline"
                >
                  {topic.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
