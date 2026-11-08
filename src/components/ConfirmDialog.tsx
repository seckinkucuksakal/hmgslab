import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmOptions } from '../hooks/useConfirm'

type ConfirmDialogProps = ConfirmOptions & {
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  details,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onCancel])

  const danger = tone === 'danger'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={message ? 'confirm-dialog-message' : undefined}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-4">
          <span
            aria-hidden
            className={[
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              danger
                ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
            ].join(' ')}
          >
            {danger ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M8.3 2.9a2 2 0 0 1 3.4 0l6.3 11a2 2 0 0 1-1.7 3H3.7a2 2 0 0 1-1.7-3l6.3-11ZM10 7a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 8a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1-11a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm0 3a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0v-4Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold text-gray-900 dark:text-slate-100"
            >
              {title}
            </h2>
            {message && (
              <div
                id="confirm-dialog-message"
                className="mt-2 text-sm text-gray-600 dark:text-slate-400"
              >
                {message}
              </div>
            )}
          </div>
        </div>

        {details && details.length > 0 && (
          <dl className="mt-5 space-y-1.5 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-slate-800/60">
            {details.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-gray-600 dark:text-slate-400">{row.label}</dt>
                <dd className="font-semibold text-gray-900 tabular-nums dark:text-slate-100">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={[
              'rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              danger
                ? 'bg-red-600 hover:bg-red-500 focus-visible:outline-red-600'
                : 'bg-gray-900 hover:bg-gray-800 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type Pending = ConfirmOptions & { resolve: (value: boolean) => void }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending((current) => {
          // a new request supersedes an unanswered one
          current?.resolve(false)
          return { ...options, resolve }
        })
      }),
    [],
  )

  const close = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value)
        return null
      })
    },
    [],
  )

  const onCancel = useCallback(() => close(false), [close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog {...pending} onConfirm={() => close(true)} onCancel={onCancel} />
      )}
    </ConfirmContext.Provider>
  )
}
