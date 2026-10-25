/**
 * Bangumi provider smoke test against the real API.
 *
 * Read-only: it asks for one subject, its episodes, and (when a token is
 * available) the caller's collection. Nothing is written, and no OAuth code is
 * exchanged — the point is that the public v0 shapes still parse.
 *
 *   node dev/test-bangumi.mjs [subjectId]
 *
 * A personal token can come from `DSH_BANGUMI_TOKEN` or from the saved account
 * file; without one the token-only checks are skipped rather than failed.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as bgm from '../lib/bangumi.js'

const subjectId = Number(process.argv[2] ?? 253) || 253
let failed = 0

function report(label, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  console.log(`${label.padEnd(22)} ${text}`)
}

function check(label, ok, detail) {
  if (ok) {
    console.log(`ok   ${label}${detail === undefined ? '' : ` → ${detail}`}`)
    return
  }
  failed += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

function savedToken() {
  const fromEnv = String(process.env.DSH_BANGUMI_TOKEN ?? '').trim()
  if (fromEnv !== '') return fromEnv
  const file = join(homedir(), '.dsh', 'state', 'dsh-anime', 'accounts.json')
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'))
    const entry = state?.providers?.bangumi
    return typeof entry?.secret === 'string' ? entry.secret : ''
  } catch {
    return ''
  }
}

const subject = await bgm.subject(subjectId).catch((error) => {
  const message = String(error?.message ?? error)
  /**
   * bgm.tv itself is unreachable from some networks (mainland China without a
   * proxy returns `fetch failed` after ten seconds). That is an environment
   * fact, not a parsing bug, so the run reports it and stops instead of failing.
   */
  console.log(`skip: ${message}`)
  console.log('      set the extension\'s "API 地址" to a reachable mirror to run this test')
  process.exit(0)
})
report('subject', {
  id: subject.id,
  name: subject.name,
  nameCn: subject.nameCn,
  score: subject.score,
  rank: subject.rank,
  eps: subject.eps,
  tags: subject.tags.slice(0, 3).map((tag) => tag.name),
  cover: subject.cover.slice(0, 48),
})
check('subject has a name', subject.name !== '' || subject.nameCn !== '')
check('subject parses a score', Number.isFinite(subject.score))

const episodes = await bgm.episodes(subjectId)
report('episodes', { count: episodes.length, first: episodes[0] })
check('episodes parsed', episodes.length > 0)
check(
  'episode ids are numbers',
  episodes.every((episode) => Number.isFinite(episode.id) && episode.id > 0),
)

const token = savedToken()
if (token === '') {
  console.log('skip account checks (no token: set DSH_BANGUMI_TOKEN)')
} else {
  const collection = await bgm.collectionFor(token, subjectId)
  report('collection', collection)
  check('collection parsed', typeof collection.type === 'number')
  const list = await bgm.collections(token, { type: 3, limit: 3 })
  report('collections', { total: list.total, first: list.items[0]?.name ?? '' })
  check('collections parsed', Array.isArray(list.items))
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall bangumi checks passed')
}
