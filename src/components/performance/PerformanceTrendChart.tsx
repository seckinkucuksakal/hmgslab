import type { RecentExamPerformance } from '../../types/performance'
import { formatPercent } from '../../types/performance'

type PerformanceTrendChartProps = {
  exams: RecentExamPerformance[]
}

export function PerformanceTrendChart({ exams }: PerformanceTrendChartProps) {
  const points = [...exams].reverse().slice(-12)

  if (points.length < 2) {
    return (
      <p className="text-sm text-gray-500">
        Trend grafiği için en az iki tamamlanmış deneme gerekir.
      </p>
    )
  }

  const width = 320
  const height = 80
  const padding = 8
  const maxPercent = 100
  const minPercent = 0
  const range = maxPercent - minPercent || 1

  const coords = points.map((point, index) => {
    const x =
      padding +
      (index / (points.length - 1)) * (width - padding * 2)
    const y =
      height -
      padding -
      ((point.correct_percent - minPercent) / range) *
        (height - padding * 2)
    return { x, y, point }
  })

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-20 w-full max-w-md text-gray-800"
        role="img"
        aria-label="Son denemelerde doğru yüzdesi trendi"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        {coords.map(({ x, y, point }) => (
          <circle
            key={point.attempt_id}
            cx={x}
            cy={y}
            r={3}
            fill="currentColor"
          >
            <title>
              {point.exam_title}: %{formatPercent(point.correct_percent)}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  )
}
