import { apply } from '../index.js'

const routes = new Map()
const ctx = {
  inject(_deps, fn) {
    fn({ webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } }, loader: {} })
  },
  logger: { info() {}, warn() {}, error() {} },
}
apply(ctx)

const response = () => {
  const chunks = []
  return {
    writeHead() {},
    setHeader() {},
    end(body) { if (body !== undefined) chunks.push(String(body)) },
    write(chunk) { chunks.push(String(chunk)) },
    text() { return chunks.join('') },
  }
}

const get = async (path) => {
  const base = path.indexOf('?') < 0 ? path : path.slice(0, path.indexOf('?'))
  const res = response()
  await routes.get(`/dsh-anime/api/${base}`)(
    { method: 'GET', url: `/dsh-anime/api/${path}`, headers: {}, socket: {}, on() {}, once() {}, resume() {} },
    res,
  )
  return JSON.parse(res.text())
}

const post = async (path, body) => {
  const handler = routes.get(`/dsh-anime/api/${path}`)
  if (handler === undefined) throw new Error(`no POST route ${path}`)
  const res = response()
  const payload = JSON.stringify(body)
  await handler(
    {
      method: 'POST',
      url: `/dsh-anime/api/${path}`,
      headers: { 'content-type': 'application/json' },
      socket: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(payload) },
      on(event, fn) { if (event === 'data') fn(Buffer.from(payload)); if (event === 'end') fn() },
      once() {},
      resume() {},
    },
    res,
  )
  return JSON.parse(res.text())
}

const payloadOf = (result) => result.data ?? result

const before = payloadOf(await get('extensions/source?id=anibt')).files[0]
console.log('backups before:', before.backups.length)

const saved = payloadOf(await post('extensions/source-save', { id: 'anibt', path: before.path, content: `${before.content}\n// touch\n` }))
console.log('save:', saved.ok, saved.backup ?? '')

const listed = payloadOf(await get('extensions/source?id=anibt')).files[0]
console.log('backups now:', listed.backups.length, listed.backups[0]?.name ?? '')

const restored = payloadOf(await post('extensions/source-restore', { id: 'anibt', path: before.path }))
console.log('restore:', JSON.stringify(restored).slice(0, 220))

const after = payloadOf(await get('extensions/source?id=anibt')).files[0]
console.log('content back to original:', after.content === before.content)
