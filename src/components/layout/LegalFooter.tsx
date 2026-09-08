import { Link } from 'react-router-dom'

const legalLinks = [
  { to: '/kvkk', label: 'KVKK' },
  { to: '/gizlilik', label: 'Gizlilik Politikası' },
  { to: '/cerez-politikasi', label: 'Çerez Politikası' },
  { to: '/kullanim-kosullari', label: 'Kullanım Koşulları' },
] as const

export function LegalFooter() {
  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-slate-500">
        {legalLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="hover:text-gray-900 hover:underline dark:hover:text-slate-200"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
