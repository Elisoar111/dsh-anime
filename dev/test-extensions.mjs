/**
 * Exercises the extension system through the real routes: list, toggle, save
 * preferences, and a torrent search that honours them.
 */
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const routes = new Map()
const ctx = {
  effect(fn) {
    fn()
  },
  inject(_names, fn) {
    fn({
      webServer: {
        register(route) {
          routes.set(route.path, route.handler)
          return () => {}
        },
      },
      logger: { info() {}, warn() {}, error() {} },
    })
  },
}

apply(ctx)

const prefix = '/dsh-anime/api'

function fakeResponse() {
  const chunks = []
  const res = new Readable({ read() {} })
  res.writeHead = () => res
  res.setHeader = () => res
  res.end = (body) => {
    if (body !== undefined) chunks.push(Buffer.from(typeof body === 'string' ? body : String(body)))
    if (!res.readableEnded) {
      res.push(Buffer.concat(chunks))
      res.push(null)
    }
    return res
  }
  res.bodyText = () => Buffer.concat(chunks).toString('utf8')
  return res
}

async function invoke(name, { method = 'GET', query = {}, body = null } = {}) {
  const handler = routes.get(`${prefix}/${name}`)
  if (handler === undefined) throw new Error(`no route ${name}`)
  const url = new URL(`http://local${prefix}/${name}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  const request = body === null ? Readable.from([]) : Readable.from([Buffer.from(JSON.stringify(body))])
  request.method = method
  request.url = url.toString()
  request.headers = { 'content-type': 'application/json' }
  const response = fakeResponse()
  await handler(request, response)
  await new Promise((resolve) => setTimeout(resolve, 40))
  const text = response.bodyText()
  return text === '' ? null : JSON.parse(text)
}

const items = (payload) => payload?.data?.items ?? payload?.items ?? []
// A body may be null when the route refused (sometimes for a reason worth
// reading, e.g. the sandbox denying the settings write): print that instead of
// falling over on `undefined`.
const show = (label, value) => {
  const text = value === undefined ? '(undefined)' : JSON.stringify(value, null, 2)
  console.log(`\n### ${label}\n${String(text).slice(0, 1200)}`)
}
const why = (payload) => (payload?.error === undefined ? null : `  !! ${payload.error.message ?? JSON.stringify(payload.error)}`)

const listed = await invoke('extensions')
show(
  'extensions',
  items(listed).map((item) => ({
    id: item.id,
    type: item.type,
    enabled: item.enabled,
    fields: item.settings.map((field) => `${field.key}:${field.kind}`),
    values: item.values,
  })),
)

const off = await invoke('extensions/toggle', { method: 'POST', body: { id: 'animetosho', enabled: false } })
show('animetosho disabled', { enabled: items(off).find((item) => item.id === 'animetosho')?.enabled })
if (why(off) !== null) console.log(why(off))

const saved = await invoke('extensions/save', {
  method: 'POST',
  body: { id: 'anibt', values: { limit: 3, includeBatches: false } },
})
show('anibt saved', items(saved).find((item) => item.id === 'anibt')?.values)
if (why(saved) !== null) console.log(why(saved))

const search = await invoke('torrent/search', {
  query: { q: 'Ao no Hako Season 2', titles: '青之箱,青春之箱,アオのハコ', episode: 3, provider: 'auto' },
})
const data = search?.data ?? search
show('torrent/search', {
  ok: search?.ok,
  provider: data?.provider,
  scanned: data?.scanned,
  count: (data?.items ?? []).length,
  notes: data?.notes,
})

const restored = await invoke('extensions/toggle', { method: 'POST', body: { id: 'animetosho', enabled: true } })
const reset = await invoke('extensions/save', {
  method: 'POST',
  body: { id: 'anibt', values: { limit: 24, includeBatches: true } },
})
show('restored', {
  animetosho: items(restored).find((item) => item.id === 'animetosho')?.enabled,
  anibt: items(reset).find((item) => item.id === 'anibt')?.values,
})

const guarded = await invoke('anilist/season', { query: { season: 'WINTER', year: 2026 } })
show('anilist/season still works', { ok: guarded?.ok, count: (guarded?.data?.items ?? guarded?.items ?? []).length })
