import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AuthLayoutProps = {
  title: string
  children: ReactNode
}

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Link to="/" className="text-xl font-semibold text-gray-900">
            HMGS
          </Link>
          <h1 className="mt-2 text-lg font-medium text-gray-800">{title}</h1>
        </div>
        {children}
      </div>
    </main>
  )
}
