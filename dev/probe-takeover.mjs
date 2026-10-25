/**
 * A reload that skipped the old disposer leaves its routes in the host's exact
 * table; the plugin must take those paths back instead of silently keeping the
 * older build's handler.
 *
 *   node dev/probe-takeover.mjs
 */
import { apply } from '../index.js'

const exact = new Map()
const prefixes = new Map()
let staleHits = 0

// Pre-seed the table the way a skipped dispose would leave it.
for (const path of ['/dsh-anime/api/health', '/dsh-anime/api/anilist/season']) {
  exact.set(path, {
    kind: 'exact',
    path,
    handler: () => {
      staleHits += 1
    },
  })
}

const webServer = {
  exact,
  prefixes,
  register(route) {
    const table = route.kind === 'exact' ? exact : prefixes
    if (table.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
    table.set(route.path, route)
    return () => table.delete(route.path)
  },
}

const warnings = []
const originalWarn = console.warn
console.warn = (...args) => {
  warnings.push(args.join(' '))
}

apply({ inject(_deps, callback) { callback({ webServer }) } })

await new Promise((resolve) => setTimeout(resolve, 50))
console.warn = originalWarn

const health = exact.get('/dsh-anime/api/health')
const season = exact.get('/dsh-anime/api/anilist/season')
const total = exact.size
const duplicates = warnings.filter((line) => line.includes('duplicate exact route'))

// The registered handler must be the plugin's, not the stale stub.
let answered = 0
await health.handler(
  { method: 'GET', url: '/dsh-anime/api/health', headers: { host: '127.0.0.1:17448' } },
  { writeHead() {}, end() { answered += 1 } },
)

const checks = [
  ['stale health route replaced (not the stub)', staleHits === 0],
  ['stale season route replaced', season !== undefined && season.handler !== undefined],
  ['all routes registered', total >= 55],
  ['no duplicate-route warnings', duplicates.length === 0],
  ['health answered by the plugin', answered === 1],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed += 1
}
console.log(`exact routes: ${total}, warnings: ${warnings.length}`)
process.exit(failed === 0 ? 0 : 1)
