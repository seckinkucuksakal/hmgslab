import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/error-reporting'

type State = { failed: boolean }

/** Last-resort screen; saved exam answers live outside React state and survive a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportError(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Bir sorun oluştu</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sayfa beklenmedik şekilde durdu. Yeniden yüklemek kayıtlı cevaplarınızı
          silmez.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-md bg-blue-600 dark:bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Sayfayı yenile
        </button>
      </div>
    )
  }
}
