// Usage: npm i --no-save @electric-sql/pglite && node scripts/db-checks/run.mjs
import { setupDb, failureCount } from './harness.mjs'

const suites = ['privacy', 'exam-content', 'listing', 'billing']
for (const name of suites) {
  console.log(`\n== ${name}`)
  const ctx = await setupDb()
  const { default: run } = await import(`./${name}.mjs`)
  await run(ctx)
}
const failed = failureCount()
console.log(failed === 0 ? '\nAll checks passed' : `\n${failed} check(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
