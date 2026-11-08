import { avatarColor, initialOf } from '../../lib/lobby'

type ExamHallProps = {
  me: string
  /** user id -> display name for everyone enrolled */
  participants: Record<string, string>
  /** user ids currently in the room */
  online: string[]
  enrolledCount: number
  boardText: string
}

// 4 desks per row on phones, 6 from sm up; rows are filled in multiples of 12
const ROW_FILL = 12

type Seat =
  | { kind: 'present'; userId: string; name: string; isMe: boolean }
  | { kind: 'away'; userId: string; name: string }
  | { kind: 'empty'; key: string }

function Desk({ seat }: { seat: Seat }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-11 w-11">
        {seat.kind === 'present' ? (
          <>
            <span
              className={[
                'flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white shadow-md transition',
                avatarColor(seat.userId),
                seat.isMe ? 'ring-4 ring-blue-200 dark:ring-blue-900' : 'ring-2 ring-white dark:ring-slate-900',
              ].join(' ')}
              title={seat.name}
            >
              {initialOf(seat.name)}
            </span>
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900"
            />
          </>
        ) : seat.kind === 'away' ? (
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-sm font-medium text-gray-400 dark:border-slate-600 dark:text-slate-500"
            title={`${seat.name} · henüz salonda değil`}
          >
            {initialOf(seat.name)}
          </span>
        ) : (
          <span className="block h-11 w-11" />
        )}
      </div>
      {/* the desk */}
      <div
        className={[
          'h-2.5 w-14 rounded-sm shadow-inner',
          seat.kind === 'present'
            ? 'bg-amber-700/70 dark:bg-amber-800/80'
            : 'bg-amber-700/25 dark:bg-amber-900/40',
        ].join(' ')}
      />
      <span
        className={[
          'max-w-[4.5rem] truncate text-[11px] leading-tight',
          seat.kind === 'present'
            ? 'font-medium text-gray-800 dark:text-slate-200'
            : 'text-gray-400 dark:text-slate-500',
        ].join(' ')}
      >
        {seat.kind === 'present' ? (seat.isMe ? 'Sen' : seat.name) : seat.kind === 'away' ? seat.name : ' '}
      </span>
    </div>
  )
}

/** A classroom: board on top, a desk per enrolled participant, people at their desks. */
export function ExamHall({ me, participants, online, enrolledCount, boardText }: ExamHallProps) {
  // only people the server lists as enrolled are ever shown
  const onlineSet = new Set(online.filter((id) => id === me || id in participants))
  const presentIds = [me, ...online.filter((id) => id !== me)].filter((id) => onlineSet.has(id) || id === me)
  const awayIds = Object.keys(participants).filter((id) => !onlineSet.has(id) && id !== me)

  const seats: Seat[] = [
    ...presentIds.map<Seat>((id) => ({
      kind: 'present',
      userId: id,
      name: participants[id] ?? 'Katılımcı',
      isMe: id === me,
    })),
    ...awayIds.map<Seat>((id) => ({ kind: 'away', userId: id, name: participants[id] })),
  ]
  const total = Math.max(ROW_FILL, Math.ceil(Math.max(seats.length, enrolledCount) / ROW_FILL) * ROW_FILL)
  for (let i = seats.length; i < total; i++) seats.push({ kind: 'empty', key: `empty-${i}` })

  const presentCount = presentIds.length

  return (
    <section
      aria-label="Sınav salonu"
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4 sm:p-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Sınav salonu</h2>
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
          <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">
            {presentCount}
          </span>
          kişi salonda · {enrolledCount} kayıtlı
        </p>
      </div>

      {/* the board */}
      <div className="mx-auto mt-4 w-full max-w-md rounded-lg border-4 border-amber-900/60 bg-emerald-900 px-4 py-2.5 text-center shadow-inner dark:border-amber-950">
        <p className="truncate font-mono text-sm text-emerald-50/90">{boardText}</p>
      </div>

      <div className="mt-6 grid flex-1 grid-cols-4 content-start gap-x-2 gap-y-4 sm:grid-cols-6">
        {seats.map((seat) => (
          <Desk key={seat.kind === 'empty' ? seat.key : seat.userId} seat={seat} />
        ))}
      </div>
    </section>
  )
}
