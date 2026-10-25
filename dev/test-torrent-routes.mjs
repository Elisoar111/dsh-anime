// __fetchSpy: log every outbound fetch with its caller, so an unawaited request
// somewhere in the stack cannot fail invisibly.
const realFetch = globalThis.fetch
globalThis.fetch = function spyFetch(...args) {
  const caller = (new Error().stack ?? '').split('\n').slice(2, 4).map((line) => line.trim()).join(' | ')
  console.log('[__fetchSpy]', String(args[0]).slice(0, 110), '\n            <-', caller)
  return realFetch.apply(this, args)
}
process.on('unhandledRejection', (reason) => {
  console.log('[__fetchSpy] UNHANDLED REJECTION', reason?.message ?? reason)
})
// End-to-end: real HTTP server, real AnimeTosho search, real magnet, real bytes.
import http from 'node:http'
import { apply } from '../index.js'

const routes = new Map()
const ctx = {
  inject(_names, factory) {
    factory({
      webServer: {
        register(route) {
          routes.set(route.path, route.handler)
          return () => routes.delete(route.path)
        },
        getOrigin() {
          return 'http://127.0.0.1'
        },
      },
    })
  },
}
apply(ctx)

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const handler = routes.get(url.pathname)
  if (!handler) {
    response.writeHead(404)
    response.end('no route')
    return
  }
  await handler(request, response)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const report = { routes: [...routes.keys()].sort() }

async function getJson(path, options) {
  const at = Date.now()
  try {
    const response = await fetch(`${base}${path}`, options)
    const body = await response.json()
    return { status: response.status, body, ms: Date.now() - at }
  } catch (error) {
    console.log('FETCH FAILED', path.slice(0, 120), Date.now() - at, 'ms', error?.cause?.code ?? error?.message)
    throw error
  }
}

async function unusedGuard(path, options) {
  const response = await fetch(`${base}${path}`, options)
  const body = await response.json()
  return { status: response.status, body }
}

// 1. Search
var TITLE_QUERY = 'Ao no Hako Season 2'
var TITLE_ALIASES = ['青之箱', '青春之箱', 'アオのハコ']
const search = await getJson(
  `/dsh-anime/api/torrent/search?q=${encodeURIComponent(TITLE_QUERY)}&titles=${encodeURIComponent(TITLE_ALIASES.join(','))}&provider=all&episode=3`,
)
report.search = {
  ok: search.body.ok,
  total: search.body.data?.total,
  scanned: search.body.data?.scanned,
  first: search.body.data?.items?.slice(0, 3).map((item) => ({
    title: item.title.slice(0, 70),
    size: item.formattedSize,
    seeders: item.seeders,
    ep: item.episodeNumber,
    batch: item.isBatch,
    hash: item.infoHash,
  })),
  error: search.body.error?.message,
}

const candidates = (search.body.data?.items ?? []).filter((item) => !item.isBatch && item.episodeNumber === 1)
const chosen = candidates[0] ?? search.body.data?.items?.[0]
if (chosen === undefined) {
  console.log(JSON.stringify(report, null, 2))
  server.close()
  process.exit(0)
}
report.chosen = { title: chosen.title.slice(0, 80), hash: chosen.infoHash, seeders: chosen.seeders }

// 2. Status (engine + tools)
const status = await getJson('/dsh-anime/api/torrent/status')
report.status = { ok: status.body.ok, backend: status.body.data?.backend, ffmpeg: status.body.data?.ffmpeg, players: status.body.data?.players?.map((p) => p.label) }

// 3. Add the magnet
const add = await getJson('/dsh-anime/api/torrent/add', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ magnet: chosen.magnet }),
})
report.add = { ok: add.body.ok, hash: add.body.data?.hash, error: add.body.error?.message }

// 4. Wait for metadata, then list
const hash = add.body.data?.hash ?? chosen.infoHash
let list = null
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const current = await getJson('/dsh-anime/api/torrent/list')
  const item = current.body.data?.items?.find((entry) => entry.hash === hash)
  if (item !== undefined && item.ready === true && item.files.length > 0) {
    list = item
    break
  }
  if (attempt % 5 === 0) {
    console.log('waiting for metadata…', attempt * 2, 's', 'ready=', item?.ready, 'name=', item?.name ?? '-')
  }
}
report.list = list === null
  ? { ready: false }
  : {
      name: list.name,
      progress: Number(list.progress.toFixed(3)),
      size: list.formattedSize,
      peers: list.peers,
      speed: list.formattedSpeed,
      files: list.files.slice(0, 4).map((file) => ({ index: file.index, name: file.name, size: file.size, browser: file.browser })),
    }

// 5. Stream the first bytes of the largest file
if (list !== null) {
  const file = list.files[0]
  const streamUrl = `/dsh-anime/api/torrent/stream?hash=${hash}&index=${file.index}`
  const started = Date.now()
  const response = await fetch(`${base}${streamUrl}`, { headers: { range: 'bytes=0-65535' } })
  const buffer = Buffer.from(await response.arrayBuffer())
  report.streamRange = {
    status: response.status,
    bytes: buffer.length,
    type: response.headers.get('content-type'),
    range: response.headers.get('content-range'),
    ms: Date.now() - started,
    magic: buffer.subarray(0, 4).toString('hex'),
  }

  const full = await fetch(`${base}${streamUrl}`)
  const reader = full.body.getReader()
  let total = 0
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && total < 8_000_000) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
  }
  reader.cancel().catch(() => {})
  report.streamRead = { status: full.status, bytesBeforeCancel: total, type: full.headers.get('content-type') }
}

console.log(JSON.stringify(report, null, 2))
server.close()
setTimeout(() => process.exit(0), 500)
