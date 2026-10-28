/**
 * Per-question answer save queue.
 *
 * - Keeps only the latest desired option per question.
 * - Never has two requests in flight for the same question, so a late response
 *   can never overwrite a newer selection (a newer value is re-sent instead).
 * - An answer leaves the queue only after the server confirmed that exact value.
 * - Unconfirmed answers are mirrored to storage (keyed by user + attempt) so a
 *   refresh or lost connection does not drop them.
 */

export type AnswerSaver = (
  questionId: string,
  optionId: string | null,
) => Promise<void>

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type AnswerQueueState = {
  /** Answers not yet confirmed by the server. */
  unsaved: number
  /** A request is currently in flight. */
  saving: boolean
  /** The last attempt failed and a retry is scheduled. */
  failing: boolean
  /** Server permanently refused writes (attempt ended / time is up). */
  closed: boolean
  /** Answers the server rejected permanently and that were dropped. */
  rejected: number
}

type Options = {
  save: AnswerSaver
  storage?: QueueStorage | null
  storageKey: string
  onChange?: (state: AnswerQueueState) => void
  retryDelayMs?: number
}

const CLOSED_PATTERNS = ['düzenlenemez', 'süresi doldu']
const REJECT_PATTERNS = ['bulunamadı', 'ait değil', 'Seçenek']

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message: unknown }).message)
    : ''
}

export function answerStorageKey(userId: string, attemptId: string): string {
  return `hmgslab:exam-answers:${userId}:${attemptId}`
}

export class AnswerSaveQueue {
  private desired = new Map<string, string | null>()
  private inFlight = false
  private failing = false
  private closed = false
  private rejected = 0
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private waiters: Array<() => void> = []
  private readonly opts: Required<Pick<Options, 'retryDelayMs'>> & Options

  constructor(opts: Options) {
    this.opts = { retryDelayMs: 4000, ...opts }
    this.restore()
  }

  get state(): AnswerQueueState {
    return {
      unsaved: this.desired.size,
      saving: this.inFlight,
      failing: this.failing,
      closed: this.closed,
      rejected: this.rejected,
    }
  }

  /** Unconfirmed answers (restored from storage or enqueued this session). */
  pendingAnswers(): Array<[string, string | null]> {
    return [...this.desired.entries()]
  }

  set(questionId: string, optionId: string | null): void {
    if (this.closed || this.disposed) return
    this.desired.set(questionId, optionId)
    this.persist()
    this.emit()
    void this.flush()
  }

  /** Kick a flush now (e.g. connection came back, page restored). */
  retryNow(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    void this.flush()
  }

  /**
   * Resolves true once nothing is unconfirmed, false on timeout or when the
   * server permanently refuses writes.
   */
  async drain(timeoutMs: number): Promise<boolean> {
    if (this.desired.size === 0) return true
    this.retryNow()

    return new Promise<boolean>((resolve) => {
      const finish = () => {
        clearTimeout(deadline)
        this.waiters = this.waiters.filter((w) => w !== check)
        resolve(this.desired.size === 0)
      }
      const check = () => {
        if (this.desired.size === 0 || this.closed) finish()
      }
      const deadline = setTimeout(finish, timeoutMs)
      this.waiters.push(check)
    })
  }

  /** Stop all activity and forget stored answers (attempt finished/ended). */
  clear(): void {
    this.closed = true
    this.desired.clear()
    this.opts.storage?.removeItem(this.opts.storageKey)
    this.stop()
  }

  /** Re-enable after dispose (React StrictMode remounts effects). */
  activate(): void {
    this.disposed = false
  }

  /** Stop timers without touching stored answers (page unmount). */
  dispose(): void {
    this.disposed = true
    this.stop()
  }

  private stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.emit()
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.closed || this.disposed) return
    this.inFlight = true
    this.emit()

    try {
      // Loop until empty so answers changed mid-flight are re-sent in order.
      while (this.desired.size > 0 && !this.closed && !this.disposed) {
        const [questionId, sent] = this.desired.entries().next().value as [
          string,
          string | null,
        ]

        try {
          await this.opts.save(questionId, sent)
        } catch (error) {
          const message = errorMessage(error)
          if (CLOSED_PATTERNS.some((p) => message.includes(p))) {
            this.closed = true
            break
          }
          if (REJECT_PATTERNS.some((p) => message.includes(p))) {
            this.desired.delete(questionId)
            this.rejected += 1
            this.persist()
            continue
          }
          this.failing = true
          this.scheduleRetry()
          break
        }

        this.failing = false
        // Confirm only if the user did not pick something newer meanwhile.
        if (this.desired.get(questionId) === sent) {
          this.desired.delete(questionId)
        } else {
          // Move to the back so other questions are not starved.
          const latest = this.desired.get(questionId)
          this.desired.delete(questionId)
          this.desired.set(questionId, latest as string | null)
        }
        this.persist()
        this.emit()
        this.notify()
      }
    } finally {
      this.inFlight = false
      this.emit()
      this.notify()
    }
  }

  private scheduleRetry() {
    if (this.timer || this.disposed) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.opts.retryDelayMs)
  }

  private notify() {
    for (const waiter of [...this.waiters]) waiter()
  }

  private emit() {
    this.opts.onChange?.(this.state)
  }

  private persist() {
    const { storage, storageKey } = this.opts
    if (!storage) return
    try {
      if (this.desired.size === 0) storage.removeItem(storageKey)
      else storage.setItem(storageKey, JSON.stringify([...this.desired]))
    } catch {
      // Storage unavailable/full: in-memory queue still works.
    }
  }

  private restore() {
    const { storage, storageKey } = this.opts
    if (!storage) return
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return
      const entries = JSON.parse(raw) as Array<[string, string | null]>
      for (const [questionId, optionId] of entries) {
        if (typeof questionId === 'string') this.desired.set(questionId, optionId)
      }
    } catch {
      storage.removeItem(storageKey)
    }
  }
}
