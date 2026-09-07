import { Outlet } from 'react-router-dom'
import { ThemeToggle } from '../ThemeToggle'

export function ExamLayout() {
  return (
    <div className="relative min-h-screen bg-white">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle compact />
      </div>
      <Outlet />
    </div>
  )
}
