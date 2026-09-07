import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { NavbarClock, NavbarUserButton } from './NavbarClock'
import { ThemeToggle } from '../ThemeToggle'
import { SITE_MARK, SITE_NAME } from '../../lib/brand'

const navItems: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Ana Sayfa', end: true },
  { to: '/denemeler', label: 'Denemeler' },
  { to: '/sonuclar', label: 'Sonuçlar' },
  { to: '/performans', label: 'Performans' },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
    isActive
      ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/70'
      : 'text-gray-600 hover:bg-white/60 hover:text-gray-900',
  ].join(' ')

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-gray-900 text-white'
      : 'text-gray-700 hover:bg-gray-100',
  ].join(' ')

export function AppHeader() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { displayName, isAdmin } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
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
    if (signingOut) return

    setSigningOut(true)
    setMenuOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-[10px] font-bold text-white shadow-sm transition group-hover:bg-gray-800">
              {SITE_MARK}
            </span>
            <span className="hidden text-base font-semibold tracking-tight text-gray-900 sm:inline">
              {SITE_NAME}
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-gray-200/60 bg-gray-100/80 p-1 md:flex">
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
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <ThemeToggle compact />
          <NavbarClock />

          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200/70 bg-white text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav"
            aria-label={mobileNavOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="h-5 w-5"
              aria-hidden
            >
              {mobileNavOpen ? (
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              ) : (
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>

          <div className="relative hidden md:block" ref={menuRef}>
            <NavbarUserButton
              displayName={displayName}
              menuOpen={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            />

            {menuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200/80 bg-white py-1 shadow-lg ring-1 ring-black/5">
                <Link
                  to="/profil"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
                >
                  Profil
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="block w-full px-3.5 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {signingOut ? 'Çıkılıyor…' : 'Çıkış Yap'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <nav
          id="mobile-nav"
          className="border-t border-gray-200/70 bg-white/95 px-4 py-3 backdrop-blur-xl md:hidden"
        >
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileNavOpen(false)}
                  className={mobileNavLinkClass}
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
                  className={mobileNavLinkClass}
                >
                  Admin
                </NavLink>
              </li>
            )}
          </ul>

          <div className="mt-3 border-t border-gray-200/70 pt-3">
            <NavbarUserButton
              displayName={displayName}
              menuOpen={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            />
            {menuOpen && (
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200/80 bg-white py-1 shadow-sm">
                <Link
                  to="/profil"
                  onClick={() => {
                    setMenuOpen(false)
                    setMobileNavOpen(false)
                  }}
                  className="block px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Profil
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="block w-full px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {signingOut ? 'Çıkılıyor…' : 'Çıkış Yap'}
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
