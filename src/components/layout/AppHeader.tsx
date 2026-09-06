import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/denemeler', label: 'Denemeler' },
  { to: '/sonuclar', label: 'Sonuçlar' },
  { to: '/performans', label: 'Performans' },
  { to: '/soru-bankasi', label: 'Soru Bankası' },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-sm font-medium text-gray-900'
    : 'text-sm text-gray-600 hover:text-gray-900'

export function AppHeader() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { displayName, isAdmin } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          HMGS
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
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
          {isAdmin && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 md:hidden"
            aria-expanded={mobileNavOpen}
            aria-label="Menüyü aç"
          >
            Menü
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              aria-expanded={menuOpen}
            >
              {displayName}
            </button>

            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1">
                <Link
                  to="/profil"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Profil
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Çıkış Yap
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <nav className="border-t border-gray-200 px-4 py-3 md:hidden">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            {isAdmin && (
              <li>
                <NavLink
                  to="/admin"
                  onClick={() => setMobileNavOpen(false)}
                  className={navLinkClass}
                >
                  Admin
                </NavLink>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  )
}
