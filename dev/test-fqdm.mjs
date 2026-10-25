/**
 * Does the generic online surface actually work against FQDM?
 *
 * It registers the plugin's real routes on a fake host and walks the same path
 * the page walks: sources -> search -> episodes -> servers -> stream. Nothing
 * is mocked except the host, so a broken regex or a renamed field shows up
 * here instead of in the player.
 *
 *   node dev/test-fqdm.mjs [term]
 */
import { Writable } from 'node:stream'

const TERM = process.argv[2] ?? '咒术回战'

const routes = new Map()
const { apply } = await import('../index.js')
apply({
  inject: (_deps, callback) =>
    callback({ webServer: { register: (route) => (routes.set(route.path, route), () => {}) } }),
})
const at = (path) => {
  const route = routes.get(path)
  if (route === undefined) throw new Error(`route missing: ${path}`)
  return route
}

/** Collect a JSON route response. */
const json = async (path, query) => {
  let body = ''
  const response = {
    writeHead: () => {},
    setHeader: () => {},
    end: (chunk) => {
      if (chunk !== undefined) body += chunk
    },
    on: () => {},
    once: () => {},
  }
  await at(path).handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, response)
  try {
    return JSON.parse(body)
  } catch {
    return { raw: body.slice(0, 300) }
  }
}

/** Read a byte-stream route for `seconds`, timing the first chunk. */
const pull = (path, query, seconds) =>
  new Promise((resolve) => {
    const state = { firstAt: 0, bytes: 0, head: null, done: false }
    const started = Date.now()
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        if (state.firstAt === 0) state.firstAt = Date.now() - started
        if (state.head === null) state.head = Buffer.from(chunk.subarray(0, 12))
        state.bytes += chunk.byteLength
        callback()
      },
    })
    const finished = () => {
      if (state.done) return
      state.done = true
      resolve({
        firstByteMs: state.firstAt,
        mb: Math.round((state.bytes / 1024 / 1024) * 100) / 100,
        head: state.head === null ? null : [...state.head.subarray(4, 8)].map((b) => String.fromCharCode(b)).join(''),
      })
    }
    sink.on('finish', finished)
    sink.on('error', finished)
    // The route writes headers and then pipes; a plain Writable needs the two
    // response methods to exist or the failure looks like a code bug.
    sink.writeHead = () => {}
    sink.setHeader = () => {}
    at(path)
      .handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, sink)
      .catch((error) => {
        state.done = true
        resolve({ error: String(error?.message ?? error) })
      })
    setTimeout(() => {
      try {
        sink.destroy()
      } catch {
        /* already gone */
      }
      finished()
    }, seconds * 1000)
  })

const sources = await json('/dsh-anime/api/online/sources', '')
const sourceList = sources?.data?.items ?? []
const fqdm = sourceList.find((item) => item.id === 'fqdm')
console.log('sources', JSON.stringify(sourceList.map((item) => `${item.id}:${item.name}:${item.enabled}`)))
if (fqdm === undefined) throw new Error('fqdm 没有注册进 online 类型')

const servers = await json('/dsh-anime/api/online/servers', 'source=fqdm')
console.log('servers', JSON.stringify(servers?.data?.items ?? servers?.error ?? servers))

const found = await json('/dsh-anime/api/online/search', `source=fqdm&q=${encodeURIComponent(TERM)}`)
const items = found?.data?.items ?? []
console.log('search', JSON.stringify({ ok: found.ok, count: items.length, first: items[0] ?? null, error: found.error?.message }))
if (items.length === 0) {
  console.log('搜索没有结果，后面的步骤跳过')
  process.exit(0)
}

const id = String(items[0].id)
const episodes = await json('/dsh-anime/api/online/episodes', `source=fqdm&id=${id}`)
const list = episodes?.data?.items ?? []
console.log('episodes', JSON.stringify({ ok: episodes.ok, count: list.length, first: list[0] ?? null, error: episodes.error?.message }))

// The JSON API answers first, so the HTML search path is only reachable here.
const { fqdmInternals } = await import('../lib/fqdm.js')
const pageHit = await fqdmInternals.searchFromPage(TERM)
const pageItems = pageHit?.items ?? []
const pageOk = pageItems.length > 0 && pageItems.every((item) => /^\d+$/.test(item.id) && item.title !== '')
console.log(
  'search-html',
  JSON.stringify({
    ok: pageOk,
    count: pageItems.length,
    first: pageItems[0] ?? null,
    // The poster anchor's text is an episode note; a title here means the card
    // selector picked the title node rather than the poster link.
    titlesReal: pageItems.every((item) => /^第\d+集$/.test(item.title) === false),
  }),
)

if (list.length === 0) {
  console.log('没有集数，播放跳过')
  process.exit(0)
}

const episode = list[0]
const server = (servers?.data?.items ?? [])[0] ?? ''
console.log('stream', JSON.stringify(await pull('/dsh-anime/api/online/stream', `source=fqdm&episode=${encodeURIComponent(episode.id)}&server=${encodeURIComponent(server)}&start=0`, 4)))
console.log('seek  ', JSON.stringify(await pull('/dsh-anime/api/online/stream', `source=fqdm&episode=${encodeURIComponent(episode.id)}&server=${encodeURIComponent(server)}&start=120`, 4)))
