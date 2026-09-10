import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SiteLogo } from './SiteLogo'
import { ThemeToggle } from './ThemeToggle'
import { LegalFooter } from './layout/LegalFooter'
import { SITE_NAME } from '../lib/brand'

type AuthLayoutProps = {
  title: string
  children: ReactNode
}

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="flex justify-end px-4 pt-4">
        <ThemeToggle compact />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-8 pb-24">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex flex-col items-center gap-2">
              <SiteLogo size={40} />
              <span className="text-xl font-semibold text-gray-900">{SITE_NAME}</span>
            </Link>
            <h1 className="mt-2 text-lg font-medium text-gray-800">{title}</h1>
          </div>
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  )
}
