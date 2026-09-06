import { useParams } from 'react-router-dom'
import { AdminExamEditorPage } from './AdminExamEditorPage'

export function AdminEditExamPage() {
  const { examId } = useParams<{ examId: string }>()
  return <AdminExamEditorPage examId={examId} />
}
