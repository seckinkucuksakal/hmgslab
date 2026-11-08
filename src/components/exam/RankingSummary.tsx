import { Link } from 'react-router-dom'
import { secondaryButton } from '../../lib/ui'
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
      <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">
        Türkiye geneli sıralama
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
        Bu denemeye Türkiye genelinde katılan{' '}
        {formatParticipantCount(ranking.total_participants)} kişi arasındaki yerin.
      </p>

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

      <Link to={leaderboardHref} className={`mt-5 ${secondaryButton}`}>
        Türkiye geneli sıralamayı gör →
      </Link>
    </section>
  )
}
