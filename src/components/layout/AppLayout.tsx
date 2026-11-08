import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { OutOfCreditsPrompt } from '../OutOfCreditsPrompt'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <OutOfCreditsPrompt />
    </div>
  )
}
