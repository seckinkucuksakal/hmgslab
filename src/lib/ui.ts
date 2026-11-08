/**
 * Shared class names for the site's interactive elements. The brand accent is
 * blue (blue-600 in the light theme, the lighter blue-500 in the dark theme);
 * actions are bold and look like buttons so they are easy to spot.
 */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400'

export const primaryButton = [
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
  'hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50',
  'dark:bg-blue-500 dark:hover:bg-blue-400',
  focusRing,
].join(' ')

export const secondaryButton = [
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition',
  'hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50',
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  focusRing,
].join(' ')

/** "← Denemeler" style navigation: a small pill instead of thin grey text. */
export const backLink = [
  'inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-700 shadow-sm transition',
  'hover:border-gray-300 hover:text-gray-900',
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-white',
  focusRing,
].join(' ')

/** Inline text link that still reads as clickable. */
export const textLink = [
  'font-semibold text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline',
  'dark:text-blue-400 dark:hover:text-blue-300',
  focusRing,
].join(' ')
