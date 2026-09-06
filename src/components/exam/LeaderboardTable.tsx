import { Link } from 'react-router-dom'
import type { ExamLeaderboard, LeaderboardEntry } from '../../types/exam-ranking'
import { formatParticipantCount } from '../../types/exam-ranking'

function LeaderboardRow({
  entry,
  highlight,
}: {
  entry: LeaderboardEntry
  highlight?: boolean
}) {
  return (
    <tr className={highlight ? 'bg-gray-50' : undefined}>
      <td className="px-3 py-3 tabular-nums text-gray-900">{entry.rank}</td>
      <td className="px-3 py-3 text-gray-900">
        {entry.display_name}
        {entry.is_current_user && (
          <span className="ml-2 text-xs text-gray-500">(Siz)</span>
        )}
      </td>
      <td className="px-3 py-3 tabular-nums text-gray-700">
        {entry.correct_count}
      </td>
      <td className="px-3 py-3 tabular-nums text-gray-700">
        {entry.incorrect_count}
      </td>
      <td className="px-3 py-3 tabular-nums text-gray-700">
        {entry.blank_count}
      </td>
    </tr>
  )
}

type LeaderboardTableProps = {
  data: ExamLeaderboard
  showViewerSeparator?: boolean
}

export function LeaderboardTable({
  data,
  showViewerSeparator = true,
}: LeaderboardTableProps) {
  const viewerInTop =
    data.viewer_entry === null &&
    data.entries.some((entry) => entry.is_current_user)

  return (
    <div className="overflow-x-auto border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-3">Sıra</th>
            <th className="px-3 py-3">Kullanıcı</th>
            <th className="px-3 py-3">Doğru</th>
            <th className="px-3 py-3">Yanlış</th>
            <th className="px-3 py-3">Boş</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.entries.map((entry) => (
            <LeaderboardRow
              key={`${entry.rank}-${entry.display_name}`}
              entry={entry}
              highlight={entry.is_current_user}
            />
          ))}

          {showViewerSeparator && data.viewer_entry && (
            <>
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-2 text-center text-xs text-gray-400"
                >
                  ···
                </td>
              </tr>
              <LeaderboardRow entry={data.viewer_entry} highlight />
            </>
          )}

          {data.entries.length === 0 && !data.viewer_entry && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                Henüz sıralamaya girecek sonuç bulunmuyor.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!viewerInTop && !data.viewer_entry && data.total_participants > 0 && (
        <p className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
          Bu denemeye katılmadınız veya sonucunuz henüz sıralamaya dahil değil.
        </p>
      )}
    </div>
  )
}

type LeaderboardPageContentProps = {
  data: ExamLeaderboard
  backHref?: string
  backLabel?: string
}

export function LeaderboardPageContent({
  data,
  backHref,
  backLabel = '← Geri',
}: LeaderboardPageContentProps) {
  return (
    <div>
      {backHref && (
        <Link
          to={backHref}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          {backLabel}
        </Link>
      )}

      <header className="mt-4 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          {data.exam_title}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Sıralama tablosu ·{' '}
          {formatParticipantCount(data.total_participants)} katılımcı
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Her kullanıcı yalnızca en iyi sonucuyla listelenir.
        </p>
      </header>

      <div className="mt-6">
        <LeaderboardTable data={data} />
      </div>

      {data.total_participants > data.limit && (
        <p className="mt-3 text-xs text-gray-500">
          İlk {data.limit} sıra gösteriliyor.
          {data.viewer_entry
            ? ' Sizin sıranız aşağıda ayrıca listelenmiştir.'
            : ''}
        </p>
      )}
    </div>
  )
}
