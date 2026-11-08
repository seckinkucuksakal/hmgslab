import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getLobbyState,
  isNotEnrolledError,
  lobbyTopic,
  sendLobbyMessage,
  type LobbyMessage,
  type LobbyState,
} from '../lib/lobby'

const ROSTER_REFRESH_MS = 15_000
const JOIN_SETTLE_MS = 3_000

export type LobbyFeedItem =
  | { kind: 'message'; message: LobbyMessage }
  | { kind: 'join'; id: string; userId: string; name: string; at: string }

/**
 * Live lobby room for one exam: who is present (Realtime Presence, keyed by
 * user id) and the chat (stored by the server, delivered with postgres_changes
 * under RLS). Presence carries only user ids; only ids the server lists as
 * enrolled are shown, and names always come from the server.
 */
export function useExamLobby(examId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<LobbyState | null>(null)
  const [feed, setFeed] = useState<LobbyFeedItem[]>([])
  const [online, setOnline] = useState<string[]>([])
  const [notEnrolled, setNotEnrolled] = useState(false)
  const [connected, setConnected] = useState(false)
  const [lastJoin, setLastJoin] = useState<{ name: string; at: number } | null>(null)

  const stateRef = useRef<LobbyState | null>(null)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const loadState = useCallback(async () => {
    if (!examId) return null
    try {
      const next = await getLobbyState(examId)
      setState(next)
      setNotEnrolled(false)
      return next
    } catch (err) {
      if (isNotEnrolledError(err)) setNotEnrolled(true)
      return null
    }
  }, [examId])

  useEffect(() => {
    if (!examId || !enabled) return

    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    // People already in the room reach us a moment after we connect; they did
    // not just walk in, so nobody is announced during this settling window.
    let announceAfter = Number.POSITIVE_INFINITY
    let present = new Set<string>()
    let rosterTimer: number | undefined

    const announceJoin = (id: string, name: string) => {
      const at = new Date().toISOString()
      setFeed((current) => [...current, { kind: 'join', id: `${id}-${at}`, userId: id, name, at }])
      setLastJoin({ name, at: Date.now() })
    }

    // Messages from a roster refresh are merged in by id, so a missed
    // Realtime event still shows up within one refresh.
    const mergeMessages = (messages: LobbyMessage[]) => {
      setFeed((current) => {
        const seen = new Set(
          current.flatMap((item) => (item.kind === 'message' ? [item.message.id] : [])),
        )
        const missing = messages.filter((m) => !seen.has(m.id))
        if (missing.length === 0) return current
        return [...current, ...missing.map((message) => ({ kind: 'message' as const, message }))]
      })
    }

    loadState().then((initial) => {
      if (cancelled || !initial) return
      setFeed(initial.messages.map((message) => ({ kind: 'message', message })))

      // presence is keyed by user id, so several tabs of one user count once
      const room = supabase.channel(lobbyTopic(examId), {
        config: { presence: { key: initial.me } },
      })
      channel = room

      room
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'lobby_messages',
            filter: `exam_id=eq.${examId}`,
          },
          (change) => {
            const row = change.new as LobbyMessage
            const message: LobbyMessage = {
              id: row.id,
              user_id: row.user_id,
              display_name: row.display_name,
              body: row.body,
              created_at: row.created_at,
            }
            setFeed((current) =>
              current.some((item) => item.kind === 'message' && item.message.id === message.id)
                ? current
                : [...current, { kind: 'message', message }],
            )
          },
        )
        .on('presence', { event: 'sync' }, () => {
          const ids = Object.keys(room.presenceState())
          if (Date.now() >= announceAfter) {
            for (const id of ids) {
              if (present.has(id) || id === initial.me) continue
              const known = stateRef.current?.participants[id]
              if (known) {
                announceJoin(id, known)
                continue
              }
              // enrolled after we loaded: refresh the roster, then announce.
              // Ids the server does not list are never shown.
              void loadState().then((next) => {
                const name = next?.participants[id]
                if (!cancelled && name) announceJoin(id, name)
              })
            }
          }
          present = new Set(ids)
          setOnline(ids)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            announceAfter = Date.now() + JOIN_SETTLE_MS
            // keep the roster (new enrollments, names) and chat history fresh
            window.clearInterval(rosterTimer)
            rosterTimer = window.setInterval(() => {
              void loadState().then((next) => {
                if (!cancelled && next) mergeMessages(next.messages)
              })
            }, ROSTER_REFRESH_MS)
            setConnected(true)
            void room.track({ joined_at: new Date().toISOString() })
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false)
          }
        })
    })

    return () => {
      cancelled = true
      window.clearInterval(rosterTimer)
      if (channel) void supabase.removeChannel(channel)
      setConnected(false)
    }
  }, [examId, enabled, loadState])

  const send = useCallback(
    async (body: string) => {
      if (!examId) return
      const message = await sendLobbyMessage(examId, body)
      // the broadcast also delivers it; add now so the sender sees it instantly
      setFeed((current) =>
        current.some((item) => item.kind === 'message' && item.message.id === message.id)
          ? current
          : [...current, { kind: 'message', message }],
      )
    },
    [examId],
  )

  return {
    state,
    feed,
    online,
    connected,
    notEnrolled,
    lastJoin,
    send,
    reload: loadState,
  }
}
