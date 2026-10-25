import { apply } from '../index.js'

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

const response = () => {
  const chunks = []
  const res = {
    status: 0,
    writeHead(status) { this.status = status },
    setHeader() {},
    end(body) { if (body !== undefined) chunks.push(String(body)) },
    write(chunk) { chunks.push(String(chunk)) },
    text() { return chunks.join('') },
  }
  return res
}

const get = async (path) => {
  const base = path.indexOf('?') < 0 ? path : path.slice(0, path.indexOf('?'))
  const handler = routes.get(`/dsh-anime/api/${base}`)
  const res = response()
  await handler({ method: 'GET', url: `/dsh-anime/api/${path}`, headers: {}, socket: {}, on() {}, once() {}, resume() {} }, res)
  return JSON.parse(res.text())
}

const post = async (path, body) => {
  const handler = routes.get(`/dsh-anime/api/${path}`)
  if (handler === undefined) throw new Error(`no POST route ${path}`)
  const res = response()
  const payload = JSON.stringify(body)
  const request = {
    method: 'POST',
    url: `/dsh-anime/api/${path}`,
    headers: { 'content-type': 'application/json' },
    socket: {},
    async *[Symbol.asyncIterator]() { yield Buffer.from(payload) },
    on(event, fn) { if (event === 'data') fn(Buffer.from(payload)); if (event === 'end') fn() },
    once() {},
    resume() {},
  }
  await handler(request, res)
  return JSON.parse(res.text())
}

const source = await get('extensions/source?id=anibt')
const file = source.data.files[0]
console.log('read:', file.path, file.lines, 'lines')

// Save the same bytes back: exercises backup + node --check without changing anything.
const saved = await post('extensions/source-save', { id: 'anibt', path: file.path, content: file.content })
console.log('save same:', JSON.stringify(saved).slice(0, 240))

// Broken code must be refused and rolled back.
const broken = await post('extensions/source-save', { id: 'anibt', path: file.path, content: 'export const broken = {{{' })
console.log('save broken:', JSON.stringify(broken).slice(0, 260))

const after = await get('extensions/source?id=anibt')
console.log('rolled back:', after.data.files[0].content === file.content)

const bad = await post('extensions/source-save', { id: 'anibt', path: 'index.js', content: 'x' })
console.log('foreign path:', JSON.stringify(bad).slice(0, 160))
