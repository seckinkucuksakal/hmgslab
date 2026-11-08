import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LobbyFeedItem } from '../../hooks/useExamLobby'
import { formatIstanbulTime } from '../../lib/istanbul-time'
import { avatarColor, getLobbyErrorMessage, initialOf } from '../../lib/lobby'

type LobbyChatProps = {
  me: string
  feed: LobbyFeedItem[]
  chatOpen: boolean
  connected: boolean
  onSend: (body: string) => Promise<void>
}

const MAX_LENGTH = 300

export function LobbyChat({ me, feed, chatOpen, connected, onSend }: LobbyChatProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [feed.length])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(body)
      setDraft('')
    } catch (err) {
      setError(getLobbyErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section
      aria-label="Salon sohbeti"
      className="flex h-full min-h-[22rem] flex-col rounded-2xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Salon sohbeti</h2>
        <span
          className={[
            'flex items-center gap-1.5 text-xs',
            connected ? 'text-green-700 dark:text-green-400' : 'text-gray-400',
          ].join(' ')}
        >
          <span
            aria-hidden
            className={['h-1.5 w-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-gray-300'].join(' ')}
          />
          {connected ? 'Canlı' : 'Bağlanıyor…'}
        </span>
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {feed.length === 0 && (
          <p className="pt-6 text-center text-xs text-gray-400 dark:text-slate-500">
            Henüz mesaj yok. Selam vererek başla!
          </p>
        )}
        {feed.map((item) => {
          if (item.kind === 'join') {
            return (
              <p
                key={item.id}
                className="text-center text-xs text-gray-500 dark:text-slate-400"
              >
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 dark:bg-slate-800">
                  <span className="font-medium text-gray-700 dark:text-slate-300">{item.name}</span>{' '}
                  salona girdi · {formatIstanbulTime(item.at).slice(0, 5)}
                </span>
              </p>
            )
          }

          const { message } = item
          const mine = message.user_id === me
          return (
            <div key={message.id} className={['flex gap-2', mine ? 'flex-row-reverse' : ''].join(' ')}>
              {!mine && (
                <span
                  aria-hidden
                  className={[
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                    avatarColor(message.user_id),
                  ].join(' ')}
                >
                  {initialOf(message.display_name)}
                </span>
              )}
              <div className={['max-w-[80%]', mine ? 'text-right' : ''].join(' ')}>
                {!mine && (
                  <p className="mb-0.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
                    {message.display_name}
                  </p>
                )}
                <p
                  className={[
                    'inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-left text-sm',
                    mine
                      ? 'rounded-br-md bg-blue-600 text-white'
                      : 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100',
                  ].join(' ')}
                >
                  {message.body}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                  {formatIstanbulTime(message.created_at).slice(0, 5)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-100 p-3 dark:border-slate-800">
        {error && (
          <p className="mb-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {chatOpen ? (
          <div className="flex gap-2">
            <label htmlFor="lobby-chat-input" className="sr-only">
              Mesaj yaz
            </label>
            <input
              id="lobby-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_LENGTH}
              placeholder="Mesaj yaz…"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              Gönder
            </button>
          </div>
        ) : (
          <p className="text-center text-xs text-gray-500 dark:text-slate-400">
            Sınav başladığı için sohbet kapandı.
          </p>
        )}
      </form>
    </section>
  )
}
