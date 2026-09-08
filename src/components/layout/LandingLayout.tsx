import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'
import { LegalFooter } from './LegalFooter'
import { SITE_MARK, SITE_NAME } from '../../lib/brand'
import { routes } from '../../lib/routes'

type LandingLayoutProps = {
  children: ReactNode
}

export function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-[10px] font-bold text-white shadow-sm transition group-hover:bg-gray-800 dark:bg-blue-600 dark:group-hover:bg-blue-500">
              {SITE_MARK}
            </span>
            <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-slate-100">
              {SITE_NAME}
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-gray-600 md:flex dark:text-slate-400">
            <a href="#ozellikler" className="hover:text-gray-900 dark:hover:text-slate-100">
              Özellikler
            </a>
            <a href="#fiyatlar" className="hover:text-gray-900 dark:hover:text-slate-100">
              Fiyatlar
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle compact />
            <Link
              to={routes.giris}
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 sm:inline dark:text-slate-300 dark:hover:text-slate-100"
            >
              Giriş yap
            </Link>
            <Link
              to={routes.kayit}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Kayıt ol
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <LegalFooter />
    </div>
  )
}
