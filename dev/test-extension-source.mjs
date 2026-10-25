import { readFileSync } from 'node:fs'

const moduleUrl = new URL('../index.js', import.meta.url)
const { apply } = await import(moduleUrl.href)

const routes = new Map()
const ctx = {
  inject(_deps, fn) {
    fn({
      webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } },
      loader: {},
    })
  },
  logger: { info() {}, warn() {}, error() {} },
}

apply(ctx)
console.log('routes:', [...routes.keys()].filter((key) => key.includes('extensions')).join(', '))

const call = async (path) => {
  const base = path.indexOf('?') < 0 ? path : path.slice(0, path.indexOf('?'))
  const handler = routes.get(`/dsh-anime/api/${base}`)
  if (handler === undefined) throw new Error(`no route for ${path}`)
  const chunks = []
  const response = {
    statusCode: 0,
    writeHead(status) { this.statusCode = status },
    setHeader() {},
    end(body) { if (body !== undefined) chunks.push(String(body)); this.body = chunks.join('') },
    write(chunk) { chunks.push(String(chunk)) },
  }
  const request = { method: 'GET', url: `/dsh-anime/api/${path}`, headers: {}, socket: {}, on() {}, once() {}, resume() {} }
  await handler(request, response)
  return { status: response.statusCode, body: JSON.parse(chunks.join('') || '{}') }
}

for (const id of ['anibt', 'animetosho', 'bilibili', 'anilist']) {
  const result = await call(`extensions/source?id=${id}`)
  const file = (result.body.data ?? result.body).files?.[0]
  console.log(id, '->', result.status, result.body.ok, file?.path, file?.lines, 'lines,', file?.bytes, 'bytes')
}

const missing = await call('extensions/source?id=nope')
console.log('unknown ->', missing.status, JSON.stringify(missing.body))
