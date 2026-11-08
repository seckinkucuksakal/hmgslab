import { useEffect, useRef, useState } from 'react'
import { formatTry } from '../lib/credits'
import { formatIstanbulDateTimeShort } from '../lib/istanbul-time'

/**
 * Payment provider goes here: when PAYMENTS_ENABLED, "Ödemeye geç" should call
 * createExamOrder(examId) and hand the order id to the provider's checkout;
 * the provider's webhook fulfils the order, which also enrolls the user.
 */
const PAYMENTS_ENABLED = false

type ExamCheckoutDialogProps = {
  title: string
  scheduledStartAt: string | null
  questionCount: number
  durationMinutes: number
  priceKurus: number
  onClose: () => void
}

/** Per-exam purchase summary (site-styled; never the browser's own dialog). */
export function ExamCheckoutDialog({
  title,
  scheduledStartAt,
  questionCount,
  durationMinutes,
  priceKurus,
  onClose,
}: ExamCheckoutDialogProps) {
  const [notice, setNotice] = useState(false)
  const payRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    payRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-checkout-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-sm font-medium text-blue-100">Denemeye katıl</p>
          <h2 id="exam-checkout-title" className="mt-1 text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-blue-100">
            {scheduledStartAt ? `${formatIstanbulDateTimeShort(scheduledStartAt)} · ` : ''}
            {questionCount} soru · {durationMinutes} dk
          </p>
        </div>

        <div className="px-6 py-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4 text-gray-600 dark:text-slate-400">
              <dt>Deneme ücreti</dt>
              <dd>{formatTry(priceKurus)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-gray-100 pt-3 text-base font-semibold text-gray-900 dark:border-slate-800 dark:text-slate-100">
              <dt>Toplam</dt>
              <dd className="tabular-nums">{formatTry(priceKurus)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-gray-500 dark:text-slate-400">
            Ödemen onaylanınca bu denemeye otomatik olarak kaydolursun.
            {scheduledStartAt
              ? ' Canlı sınava katılmazsan ücretin bir sonraki denemen için hesabında kalır.'
              : ' Bu denemeyi dilediğin kadar tekrar çözebilirsin.'}
          </p>

          {notice && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
            >
              Online ödeme çok yakında aktif olacak.
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Vazgeç
            </button>
            <button
              ref={payRef}
              type="button"
              onClick={() => {
                if (!PAYMENTS_ENABLED) setNotice(true)
              }}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Ödemeye geç · {formatTry(priceKurus)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
