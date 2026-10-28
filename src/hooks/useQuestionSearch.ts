import { useEffect, useState } from 'react'
import {
  QUESTION_PAGE_SIZE,
  searchQuestions,
  type QuestionListRow,
  type QuestionSearchParams,
} from '../lib/question-search'

type Result = {
  key: string
  rows: QuestionListRow[]
  total: number
  failed: boolean
}

const SEARCH_DEBOUNCE_MS = 300

/**
 * Filter/search/pagination state for a database-backed question list.
 * Any filter change resets to the first page; responses to superseded
 * requests are discarded.
 */
export function useQuestionSearch(options: { forceActive?: boolean } = {}) {
  const [search, setSearchRaw] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [subjectId, setSubjectRaw] = useState('')
  const [topicId, setTopicRaw] = useState('')
  const [difficulty, setDifficultyRaw] = useState('')
  const [active, setActiveRaw] = useState<QuestionSearchParams['active']>(
    options.forceActive ? 'active' : 'all',
  )
  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  // A new search term (after debounce) always starts from the first page.
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  const key = JSON.stringify([debouncedSearch, subjectId, topicId, difficulty, active, page, reloadKey])

  useEffect(() => {
    let cancelled = false
    searchQuestions({
      search: debouncedSearch,
      subjectId,
      topicId,
      difficulty,
      active,
      page,
    })
      .then((res) => {
        if (!cancelled) setResult({ key, ...res, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ key, rows: [], total: 0, failed: true })
      })
    return () => {
      cancelled = true
    }
    // key encodes every input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const loading = result?.key !== key
  const total = result?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE))

  return {
    search,
    subjectId,
    topicId,
    difficulty,
    active,
    page,
    setSearch: (value: string) => setSearchRaw(value),
    setSubjectId: (value: string) => {
      setSubjectRaw(value)
      setTopicRaw('')
      setPage(0)
    },
    setTopicId: (value: string) => {
      setTopicRaw(value)
      setPage(0)
    },
    setDifficulty: (value: string) => {
      setDifficultyRaw(value)
      setPage(0)
    },
    setActive: (value: QuestionSearchParams['active']) => {
      setActiveRaw(value)
      setPage(0)
    },
    setPage,
    reload: () => setReloadKey((n) => n + 1),
    rows: result?.rows ?? [],
    loading,
    failed: !loading && Boolean(result?.failed),
    total,
    pageCount,
    pageSize: QUESTION_PAGE_SIZE,
  }
}

export type QuestionSearchState = ReturnType<typeof useQuestionSearch>
