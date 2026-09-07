import { Link, NavLink, Outlet } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'
import { SITE_NAME } from '../../lib/brand'

const navItems = [
  { to: '/admin/sorular', label: 'Sorular', end: true },
  { to: '/admin/denemeler', label: 'Denemeler', end: true },
  { to: '/admin/dersler', label: 'Dersler ve Konular', end: true },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-sm font-medium text-gray-900'
    : 'text-sm text-gray-600 hover:text-gray-900'

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/admin/sorular" className="text-lg font-semibold text-gray-900">
              {SITE_NAME} Admin
            </Link>
            <nav className="hidden items-center gap-5 sm:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle compact />
            <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">
              Uygulamaya dön
            </Link>
          </div>
        </div>
        <nav className="border-t border-gray-200 px-4 py-2 sm:hidden">
          <div className="flex flex-wrap gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
