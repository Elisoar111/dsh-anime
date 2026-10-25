import { createServer } from 'node:http'
import { apply } from '../index.js'

const routes = new Map()
const ctx = {
  inject(_deps, run) {
    run(ctx)
    return () => {}
  },
  effect() {
    return () => {}
  },
  logger: { info() {}, warn() {}, error: console.error },
  webServer: {
    register(route) {
      routes.set(`${route.kind}:${route.path}`, route)
      return () => routes.delete(`${route.kind}:${route.path}`)
    },
    getOrigin: () => 'http://127.0.0.1:9',
  },
  config: { desktopHost: true },
  storage: { async get() {}, async set() {} },
}

apply(ctx)
await new Promise((resolve) => setTimeout(resolve, 50))

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const route = routes.get(`exact:${url.pathname}`)
  if (route === undefined) {
    response.writeHead(404).end('no route')
    return
  }
  await route.handler(request, response)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const pickArray = (payload) => {
  const candidates = []
  const walk = (value, depth) => {
    if (depth > 2 || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object') candidates.push(value)
      return
    }
    for (const entry of Object.values(value)) walk(entry, depth + 1)
  }
  walk(payload, 0)
  return candidates[0] ?? []
}

const show = (label, payload) => {
  const list = pickArray(payload)
  console.log(`\n### ${label}: keys=${Object.keys(payload ?? {}).join(',')} items=${list.length}`)
  for (const item of list.slice(0, 3)) {
    console.log(JSON.stringify({
      title: item.title,
      titleRomaji: item.titleRomaji,
      titleNative: item.titleNative,
      titleChinese: item.titleChinese,
      titleEnglish: item.titleEnglish,
    }))
  }
}

show('season', await (await fetch(`${base}/dsh-anime/api/anilist/season?season=WINTER&year=2026&page=1`)).json())
show('search', await (await fetch(`${base}/dsh-anime/api/anilist/search?query=frieren`)).json())
show('bangumi-search', await (await fetch(`${base}/dsh-anime/api/bangumi/search?query=frieren`)).json())
show('animeko', await (await fetch(`${base}/dsh-anime/api/animeko/season?season=WINTER&year=2026`)).json())

server.close()
process.exit(0)
