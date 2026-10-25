/**
 * Drives the declarative sources with no host and no registry: search ->
 * episodes -> servers -> resolve, straight against the live sites.
 *
 *   node dev/test-websource.mjs               # 柯南
 *   node dev/test-websource.mjs 咒术回战
 */
import { join } from 'node:path'
import { loadWebSources } from '../lib/websource.js'

// The handlers live inside registerWebSources, so reach them through a tiny
// fake registry that just keeps the handlers it is given.
function fakeRegistry() {
  const registered = new Map()
  return {
    registered,
    register({ manifest, handlers }) {
      registered.set(manifest.id, { manifest, handlers })
    },
    values: () => ({}),
    list: () => [],
    setEnabled: () => {},
  }
}

const { registerWebSources } = await import('../lib/websource.js')
const dir = join(import.meta.dirname, '..', 'assets', 'sources', 'animeflow')
const registry = fakeRegistry()
const logs = []
registerWebSources({ registry, dir, log: (line) => logs.push(line) })
for (const line of logs) console.log(`  · ${line}`)

const term = process.argv[2] ?? '柯南'
let ok = 0
const all = [...registry.registered.values()]
for (const { manifest, handlers } of all) {
  const started = Date.now()
  try {
    const results = await handlers.search({ term })
    if (results.length === 0) {
      console.log(`MISS ${manifest.name.padEnd(12)} 搜不到结果`)
      continue
    }
    const first = results[0]
    const episodes = await handlers.episodes({ id: first.id })
    const servers = typeof handlers.servers === 'function' ? await handlers.servers({ id: first.id }) : []
    let play = ''
    let playType = ''
    if (episodes.length > 0) {
      const resolved = await handlers.resolve({ episodeId: episodes[0].id })
      play = String(resolved?.url ?? '')
      playType = String(resolved?.type ?? '')
    }
    const good = episodes.length > 0 && /^https?:/.test(play)
    if (good) ok += 1
    console.log(
      `${good ? 'ok  ' : 'MISS'} ${manifest.name.padEnd(12)} 搜索 ${String(results.length).padStart(2)} · ${JSON.stringify(first.title).slice(0, 22)} · 线路 ${servers.length} · 集数 ${episodes.length} · ${playType || 'no-play'} ${play.slice(0, 56)} (${Date.now() - started}ms)`,
    )
  } catch (error) {
    console.log(`ERR  ${manifest.name.padEnd(12)} ${error?.message ?? error} (${Date.now() - started}ms)`)
  }
}

console.log(`\n${ok}/${all.length} sources playable`)
