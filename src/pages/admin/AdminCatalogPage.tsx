import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'
import { slugify } from '../../lib/slugify'
import {
  fetchSubjects,
  isCatalogComplete,
  legacySubjectsOnly,
  standardSubjectsOnly,
} from '../../lib/subject-catalog'
import type { Subject, Topic } from '../../types/question-bank'

type LegacySubjectReport = {
  subject_id: string
  subject_name: string
  topic_count: number
  question_count: number
  exam_question_count: number
}

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500'
const labelClass = 'mb-1 block text-sm text-gray-700'

export function AdminCatalogPage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [legacyReport, setLegacyReport] = useState<LegacySubjectReport[]>([])
  const [topicSubjectId, setTopicSubjectId] = useState('')
  const [topicName, setTopicName] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [loadedSubjects, topicsResult, reportResult] = await Promise.all([
        fetchSubjects(),
        supabase
          .from('topics')
          .select('id, subject_id, name, slug, sort_order, is_active, created_at')
          .order('sort_order', { ascending: true }),
        supabase.rpc('admin_legacy_subject_report'),
      ])

      setSubjects(loadedSubjects)
      setTopics(topicsResult.data ?? [])
      setLegacyReport((reportResult.data ?? []) as LegacySubjectReport[])
    } catch (loadError) {
      setError(getAdminErrorMessage(loadError as Error))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

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
    const slug = slugify(topicName)
    if (subjectTopics.some((t) => t.slug === slug)) {
      setError('Bu derste aynı adlı bir konu zaten var.')
      return
    }

    const { error: insertError } = await supabase.from('topics').insert({
      subject_id: topicSubjectId,
      name: topicName.trim(),
      slug,
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

  const standardSubjects = standardSubjectsOnly(subjects)
  const legacySubjects = legacySubjectsOnly(subjects)
  const subjectRank = new Map(subjects.map((subject, index) => [subject.id, index]))
  const orderedTopics = [...topics].sort(
    (a, b) =>
      (subjectRank.get(a.subject_id) ?? 0) - (subjectRank.get(b.subject_id) ?? 0) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0),
  )
  const reportBySubject = new Map(legacyReport.map((row) => [row.subject_id, row]))

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dersler ve Konular</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ders kapsamı sabittir (19 ana ders). Dersler altında konu ekleyip
          yönetebilirsiniz.
        </p>
      </div>

      {!isCatalogComplete(subjects) && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Standart ders kataloğu eksik veya beklenenden farklı. Veritabanı
          migration’ının uygulandığını kontrol edin.
        </p>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      )}

      <div>
        <form onSubmit={handleAddTopic} className="max-w-md space-y-3">
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
              {standardSubjects.map((subject) => (
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
        <h2 className="text-base font-medium text-gray-900">Standart dersler</h2>
        <ol className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
          {standardSubjects.map((subject) => {
            const count = topics.filter((t) => t.subject_id === subject.id).length
            return (
              <li
                key={subject.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div className="flex items-baseline gap-3">
                  <span className="w-6 text-right tabular-nums text-gray-400">
                    {subject.sort_order}
                  </span>
                  <p className="font-medium text-gray-900">{subject.name}</p>
                </div>
                <span className="text-gray-500">{count} konu</span>
              </li>
            )
          })}
        </ol>
      </section>

      {legacySubjects.length > 0 && (
        <section>
          <h2 className="text-base font-medium text-gray-900">
            Kapsam dışı eski dersler
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Bu kayıtlar standart listede yer almaz. Otomatik olarak birleştirilmez
            veya yeniden adlandırılmaz; ilişkili sorular elle sınıflandırılmalıdır.
            Yeni soru bu derslere bağlanamaz.
          </p>
          <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
            {legacySubjects.map((subject) => {
              const report = reportBySubject.get(subject.id)
              return (
                <li
                  key={subject.id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">{subject.name}</p>
                    <p className="text-gray-500">
                      {report
                        ? `${report.topic_count} konu · ${report.question_count} soru · ${report.exam_question_count} denemede kullanım`
                        : subject.slug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSubjectActive(subject)}
                    className="text-gray-600 hover:underline"
                  >
                    {subject.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-base font-medium text-gray-900">Mevcut konular</h2>
        <ul className="mt-4 divide-y divide-gray-200 border-y border-gray-200">
          {orderedTopics.map((topic) => {
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
