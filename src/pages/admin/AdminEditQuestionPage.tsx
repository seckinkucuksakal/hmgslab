import { useParams } from 'react-router-dom'
import { AdminQuestionForm } from './AdminQuestionForm'

export function AdminEditQuestionPage() {
  const { questionId } = useParams<{ questionId: string }>()
  return <AdminQuestionForm questionId={questionId} />
}
