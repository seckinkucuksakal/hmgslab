import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getServerTime } from '../lib/live-exam'
import { formatIstanbulDate, formatIstanbulTime } from '../lib/istanbul-time'

type ServerClockContextValue = {
  serverNow: Date | null
  formattedDate: string
  formattedTime: string
  resync: () => Promise<void>
}

const ServerClockContext = createContext<ServerClockContextValue | null>(null)

const RESYNC_MS = 60_000

export function ServerClockProvider({ children }: { children: ReactNode }) {
  const anchorRef = useRef<{ serverMs: number; monoAt: number } | null>(null)
  const [displayMs, setDisplayMs] = useState<number | null>(null)

  const applyServerTime = useCallback((iso: string) => {
    const serverMs = new Date(iso).getTime()
    anchorRef.current = { serverMs, monoAt: performance.now() }
    setDisplayMs(serverMs)
  }, [])

  const resync = useCallback(async () => {
    try {
      const iso = await getServerTime()
      applyServerTime(iso)
    } catch {
      // Keep displaying estimated server time until the next successful sync.
    }
  }, [applyServerTime])

  useEffect(() => {
    void resync()

    const resyncInterval = window.setInterval(() => {
      void resync()
    }, RESYNC_MS)

    const tickInterval = window.setInterval(() => {
      const anchor = anchorRef.current
      if (!anchor) return
      const elapsed = performance.now() - anchor.monoAt
      setDisplayMs(anchor.serverMs + elapsed)
    }, 1000)

    return () => {
      window.clearInterval(resyncInterval)
      window.clearInterval(tickInterval)
    }
  }, [resync])

  const serverNow = displayMs !== null ? new Date(displayMs) : null

  return (
    <ServerClockContext.Provider
      value={{
        serverNow,
        formattedDate: serverNow ? formatIstanbulDate(serverNow) : '—',
        formattedTime: serverNow ? formatIstanbulTime(serverNow) : '—:—:—',
        resync,
      }}
    >
      {children}
    </ServerClockContext.Provider>
  )
}

export function useServerClock(): ServerClockContextValue {
  const ctx = useContext(ServerClockContext)
  if (!ctx) {
    throw new Error('useServerClock must be used within ServerClockProvider')
  }
  return ctx
}

/** Interpolate a server-authoritative second countdown between status polls. */
export function useServerCountdown(
  initialSeconds: number | undefined,
  resetKey: string,
): number {
  const anchorRef = useRef<{ at: number; seconds: number } | null>(null)
  const [seconds, setSeconds] = useState(initialSeconds ?? 0)

  useEffect(() => {
    if (initialSeconds === undefined) return
    anchorRef.current = { at: performance.now(), seconds: initialSeconds }
    setSeconds(initialSeconds)
  }, [initialSeconds, resetKey])

  useEffect(() => {
    if (initialSeconds === undefined) return

    const tick = window.setInterval(() => {
      const anchor = anchorRef.current
      if (!anchor) return
      const elapsed = Math.floor((performance.now() - anchor.at) / 1000)
      setSeconds(Math.max(0, anchor.seconds - elapsed))
    }, 1000)

    return () => window.clearInterval(tick)
  }, [initialSeconds, resetKey])

  return seconds
}
