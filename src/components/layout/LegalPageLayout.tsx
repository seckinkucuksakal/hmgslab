import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'
import { LegalFooter } from './LegalFooter'
import { SITE_NAME } from '../../lib/brand'

type LegalPageLayoutProps = {
  title: string
  children?: ReactNode
}

export function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <Link to="/" className="text-lg font-semibold text-gray-900">
            {SITE_NAME}
          </Link>
          <ThemeToggle compact />
        </div>
      </header>

      <article className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 pb-24">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
          {children ?? (
            <>
              <p className="rounded-md border border-gray-200 bg-white px-4 py-3 text-gray-600">
                Bu metin hukuk danışmanı tarafından hazırlanacaktır.
              </p>
              <p>
                Bu sayfa, nihai yasal metin yayımlanana kadar geçici bir
                placeholder olarak sunulmaktadır. {SITE_NAME} platformunun kişisel
                verilerin korunması, gizlilik, çerez kullanımı ve kullanım
                koşullarına ilişkin bağlayıcı hükümler, avukat incelemesi
                sonrasında burada yer alacaktır.
              </p>
            </>
          )}
        </div>
      </article>

      <LegalFooter />
    </div>
  )
}
