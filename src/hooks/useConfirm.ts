import { createContext, useContext, type ReactNode } from 'react'

export type ConfirmOptions = {
  title: string
  message?: ReactNode
  /** Optional key/value rows shown in a highlighted box (e.g. credits used / left). */
  details?: { label: string; value: ReactNode }[]
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' for irreversible actions. */
  tone?: 'default' | 'danger'
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Site-styled replacement for window.confirm: `if (!(await confirm({...}))) return`.
 * Never use the browser's confirm/alert/prompt in this app.
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return confirm
}
