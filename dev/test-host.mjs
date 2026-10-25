/**
 * Host-half smoke test, used during development only.
 * A fake Host context captures the registered routes; a fake request/response
 * pair drives them and prints the JSON the page would receive.
 *
 *   node dev/test-host.mjs [routeName ...]
 */
import { apply } from '../index.js'

const routes = new Map()

const fakeCtx = {
  inject(deps, callback) {
    callback({ webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } })
  },
}

apply(fakeCtx)

function call(path, { method = 'GET', query = '' } = {}) {
  const route = routes.get(`/dsh-anime/api/${path}`)
  if (route === undefined) return Promise.reject(new Error(`no route /dsh-anime/api/${path}`))
  const target = { status: 0, headers: null, body: '' }
  const response = {
    writeHead(status, headers) { target.status = status; target.headers = headers },
    end(chunk) { if (chunk !== undefined) target.body += String(chunk) },
  }
  const request = { method, url: `/dsh-anime/api/${path}${query ? `?${query}` : ''}` }
  return Promise.resolve(route.handler(request, response)).then(() => target)
}

const wanted = process.argv.slice(2)
const cases = [
  ['health', ''],
  ['anilist/season', 'perPage=3'],
  ['anilist/trending', 'perPage=3'],
  ['anilist/airing', ''],
  ['anilist/search', 'q=hunter'],
  ['bangumi/calendar', ''],
  ['bili/qualities', 'bvid=BV1C8nH69EpL&cid=42965076857&qn=80'],
  ['bangumi/season', 'season=FALL&year=2026'],
  ['animeko/season', 'season=FALL&year=2026&sort=newest'],
  ['animeko/search', 'q=%E5%AD%A4%E7%8B%AC%E6%91%87%E6%BB%9A'],
  ['animeko/subject', 'id=425998'],
  ['animeko/airing', 'today=2026-10-24&tz=Asia%2FShanghai'],
  ['sources', 'kind=all'],
]
const selected = wanted.length === 0 ? cases : cases.filter(([name]) => wanted.includes(name))

console.log('registered routes:', [...routes.keys()].sort().join('\n  '))

for (const [name, query] of selected) {
  const started = Date.now()
  try {
    const result = await call(name, { query })
    const ms = Date.now() - started
    const parsed = JSON.parse(result.body)
    const summary = (() => {
      if (parsed.ok === false) return `FAIL ${parsed.error.message}`
      const data = parsed.data
      if (Array.isArray(data?.items)) return `ok ${data.items.length} items, first="${data.items[0]?.title ?? '-'}"`
      if (Array.isArray(data?.providers)) return `ok ${data.providers.length} providers of ${data.total} catalogue entries, counts=${JSON.stringify(data.counts)}`
      if (Array.isArray(data?.days)) return `ok ${data.days.length} calendar days`
      return `ok ${JSON.stringify(data).slice(0, 200)}`
    })()
    console.log(`\n[${ms}ms] ${name} — HTTP ${result.status} — ${summary}`)
  } catch (error) {
    console.log(`\n${name} — THREW ${error?.message ?? error}`)
  }
}
