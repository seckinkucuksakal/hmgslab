import { Navigate, useParams } from 'react-router-dom'

export function ExamResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()

  if (!attemptId) {
    return <Navigate to="/sonuclar" replace />
  }

  return <Navigate to={`/sonuclar/${attemptId}`} replace />
}
