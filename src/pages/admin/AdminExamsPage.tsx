import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getAdminErrorMessage } from '../../lib/admin-errors'

type ExamRow = {
  id: string
  title: string
  duration_minutes: number
  is_active: boolean
  updated_at: string
  exam_questions: { count: number }[]
}

export function AdminExamsPage() {
  const [exams, setExams] = useState<ExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadExams = async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('exams')
      .select('id, title, duration_minutes, is_active, updated_at, exam_questions(count)')
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError(getAdminErrorMessage(fetchError))
      setLoading(false)
      return
    }

    setExams(
      (data ?? []).map((row) => ({
        ...row,
        exam_questions: Array.isArray(row.exam_questions)
          ? row.exam_questions
          : [row.exam_questions],
      })) as ExamRow[],
    )
    setLoading(false)
  }

  useEffect(() => {
    loadExams()
  }, [])

  const getQuestionCount = (exam: ExamRow) => {
    const entry = exam.exam_questions[0]
    return entry?.count ?? 0
  }

  const handleToggleActive = async (exam: ExamRow) => {
    const { error: updateError } = await supabase
      .from('exams')
      .update({ is_active: !exam.is_active })
      .eq('id', exam.id)

    if (updateError) {
      setError(getAdminErrorMessage(updateError))
      return
    }

    await loadExams()
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Denemeler</h1>
          <p className="mt-1 text-sm text-gray-600">
            HMGS deneme sınavlarını oluşturun ve yönetin.
          </p>
        </div>
        <Link
          to="/admin/denemeler/yeni"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Yeni Deneme
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Yükleniyor…</p>
      ) : exams.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">Henüz deneme oluşturulmamış.</p>
      ) : (
        <ul className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
          {exams.map((exam) => (
            <li key={exam.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/admin/denemeler/${exam.id}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {exam.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>{getQuestionCount(exam)} soru</span>
                    <span aria-hidden="true">·</span>
                    <span>{exam.duration_minutes} dk</span>
                    <span aria-hidden="true">·</span>
                    <span>{exam.is_active ? 'Aktif' : 'Pasif'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(exam.updated_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link
                    to={`/admin/denemeler/${exam.id}`}
                    className="text-gray-900 hover:underline"
                  >
                    Düzenle
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(exam)}
                    className="text-gray-600 hover:underline"
                  >
                    {exam.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
