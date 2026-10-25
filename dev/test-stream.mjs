// End-to-end: run the Host half on a real HTTP server and pull video bytes.
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
const port = server.address().port
const base = `http://127.0.0.1:${port}`
const out = { routes: [...routes.keys()] }

async function get(path, headers = {}) {
  const t0 = Date.now()
  const response = await fetch(`${base}${path}`, { headers })
  const buffer = Buffer.from(await response.arrayBuffer())
  return { path, status: response.status, ms: Date.now() - t0, bytes: buffer.length, headers: Object.fromEntries(response.headers) }
}

const search = await get('/dsh-anime/api/bili/search?q=' + encodeURIComponent('葬送的芙莉莲'))
out.searchRaw = { status: search.status, ms: search.ms, bytes: search.bytes }
{
  const response = await fetch(`${base}/dsh-anime/api/bili/search?q=` + encodeURIComponent('葬送的芙莉莲'))
  const body = await response.json()
  out.search = { status: response.status, ok: body.ok !== false, count: body.data?.items?.length ?? 0, first: body.data?.items?.slice(0, 3).map((item) => ({ title: item.title, seasonId: item.seasonId, episodes: item.episodes, score: item.score })) }
}

const seasonResponse = await fetch(`${base}/dsh-anime/api/bili/season?season_id=46089`)
const seasonBody = await seasonResponse.json()
out.season = {
  ok: seasonBody.ok !== false,
  title: seasonBody.data?.title,
  rating: seasonBody.data?.rating,
  episodes: seasonBody.data?.episodes?.length,
  first: seasonBody.data?.episodes?.[0] && { label: seasonBody.data.episodes[0].label, longTitle: seasonBody.data.episodes[0].longTitle, epId: seasonBody.data.episodes[0].epId, cid: seasonBody.data.episodes[0].cid },
  error: seasonBody.error?.message,
}

const ep = seasonBody.data?.episodes?.[0]
if (ep) {
  const playResponse = await fetch(`${base}/dsh-anime/api/bili/episode?ep_id=${ep.epId}&cid=${ep.cid}&qn=64`)
  const playBody = await playResponse.json()
  out.episode = { ok: playBody.ok !== false, src: playBody.data?.src, quality: playBody.data?.quality, kind: playBody.data?.kind, size: playBody.data?.size, error: playBody.error?.message }
  if (playBody.data?.src) {
    const head = await get(playBody.data.src, { Range: 'bytes=0-2047' })
    out.stream = { status: head.status, bytes: head.bytes, type: head.headers['content-type'], range: head.headers['content-range'], ms: head.ms }
    const full = await get(playBody.data.src)
    out.streamFull = { status: full.status, bytes: full.bytes, type: full.headers['content-type'], ms: full.ms }
  }
}

console.log(JSON.stringify(out, null, 2))
server.close()
