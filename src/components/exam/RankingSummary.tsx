import { Link } from 'react-router-dom'
import type { AttemptRankingResult } from '../../types/exam-ranking'
import {
  formatParticipantCount,
  formatTopPercent,
} from '../../types/exam-ranking'

type RankingSummaryProps = {
  ranking: AttemptRankingResult
  leaderboardHref: string
}

export function RankingSummary({ ranking, leaderboardHref }: RankingSummaryProps) {
  const topPercentLabel = formatTopPercent(ranking.top_percent)
  const showTopPercent =
    ranking.total_participants >= 2 && topPercentLabel !== null

  return (
    <section className="mt-8 border-t border-gray-200 pt-8">
      <h2 className="text-sm font-medium text-gray-900">
        Türkiye geneli sıralama
      </h2>

      <div className="mt-4 space-y-2">
        <p className="text-2xl font-semibold tabular-nums text-gray-900">
          {ranking.rank.toLocaleString('tr-TR')}
          <span className="text-lg font-normal text-gray-500">
            {' '}
            / {formatParticipantCount(ranking.total_participants)}
          </span>
        </p>

        {showTopPercent ? (
          <p className="text-sm text-gray-600">İlk %{topPercentLabel}</p>
        ) : ranking.total_participants === 1 ? (
          <p className="text-sm text-gray-600">
            Bu denemeye şu an yalnızca siz katıldınız.
          </p>
        ) : null}

        {!ranking.is_best_attempt && (
          <p className="text-xs text-gray-500">
            Sıralama, bu deneme için en iyi sonucunuza göre hesaplanmıştır.
          </p>
        )}
      </div>

      <Link
        to={leaderboardHref}
        className="mt-4 inline-block text-sm text-gray-900 hover:underline"
      >
        Sıralama tablosunu gör →
      </Link>
    </section>
  )
}
