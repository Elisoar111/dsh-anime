/**
 * Smoke: call the read-only routes that do not need a browser, after the
 * bilibili client moved into lib/bilibili.js. Anything that lost a closure
 * shows up here as a ReferenceError instead of in the panel.
 *
 *   node dev/probe-routes.mjs
 */
const routes = new Map()
const { apply } = await import('../index.js')
apply({
  inject: (_deps, callback) =>
    callback({ webServer: { register: (route) => (routes.set(route.path, route), () => {}) } }),
})

const call = async (path, query = '') => {
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
  const started = Date.now()
  try {
    await routes.get(path).handler({ method: 'GET', url: `${path}${query === '' ? '' : `?${query}`}`, headers: {} }, response)
  } catch (error) {
    return { path, threw: String(error?.message ?? error) }
  }
  const text = body.slice(0, 120)
  return { path, ms: Date.now() - started, ok: !/ReferenceError|is not defined/.test(body), head: text }
}

const list = [
  ['/dsh-anime/api/health'],
  ['/dsh-anime/api/settings'],
  ['/dsh-anime/api/extensions'],
  ['/dsh-anime/api/accounts'],
  ['/dsh-anime/api/stream/cache'],
  ['/dsh-anime/api/torrent/config'],
  ['/dsh-anime/api/local/roots'],
  ['/dsh-anime/api/player/shaders'],
  ['/dsh-anime/api/bili/search', 'keyword=进击'],
  ['/dsh-anime/api/online/sources'],
  ['/dsh-anime/api/online/browse', 'source=fqdm&page=1'],
  ['/dsh-anime/api/online/servers', 'source=fqdm'],
]
for (const [path, query] of list) {
  console.log(JSON.stringify(await call(path, query)))
}
