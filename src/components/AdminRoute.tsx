import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useProfile } from '../hooks/useProfile'
import { routes } from '../lib/routes'

type AdminRouteProps = {
  children: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Yükleniyor…
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to={routes.home} replace />
  }

  return children
}
