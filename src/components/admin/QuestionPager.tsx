import type { QuestionSearchState } from '../../hooks/useQuestionSearch'

export function QuestionListStatus({ state }: { state: QuestionSearchState }) {
  if (state.failed) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        <span>Sorular yüklenemedi. Bağlantınızı kontrol edin.</span>
        <button type="button" onClick={state.reload} className="font-medium underline">
          Yeniden dene
        </button>
      </div>
    )
  }
  return null
}

export function QuestionPager({ state }: { state: QuestionSearchState }) {
  if (state.failed || state.total === 0) return null

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
      <span>
        {state.total.toLocaleString('tr-TR')} soru · Sayfa {state.page + 1} /{' '}
        {state.pageCount}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={state.page === 0 || state.loading}
          onClick={() => state.setPage(state.page - 1)}
          className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
        >
          Önceki
        </button>
        <button
          type="button"
          disabled={state.page >= state.pageCount - 1 || state.loading}
          onClick={() => state.setPage(state.page + 1)}
          className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
        >
          Sonraki
        </button>
      </div>
    </div>
  )
}
