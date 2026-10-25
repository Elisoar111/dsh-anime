/** Exercise extensions/toggle through the real handler (path-keyed, method inside). */
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const routes = new Map()
apply({
  effect(fn) { fn() },
  inject(_names, fn) {
    fn({ webServer: { register(route) { routes.set(route.path, route.handler); return () => {} } }, loader: {} })
  },
  logger: { info() {}, warn() {}, error() {} },
})

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

async function invoke(name, { method = 'GET', body = null } = {}) {
  const handler = routes.get(`/dsh-anime/api/${name}`)
  if (handler === undefined) throw new Error(`no route ${name}`)
  const url = new URL(`http://local/dsh-anime/api/${name}`)
  const request = body === null ? Readable.from([]) : Readable.from([Buffer.from(JSON.stringify(body))])
  request.method = method
  request.url = url.toString()
  request.headers = { 'content-type': 'application/json' }
  const response = fakeResponse()
  await handler(request, response)
  await new Promise((resolve) => setTimeout(resolve, 60))
  const text = response.bodyText()
  return text === '' ? null : JSON.parse(text)
}

const state = async (id) => {
  const listed = await invoke('extensions')
  const items = listed?.data?.items ?? listed?.items ?? []
  return items.find((item) => item.id === id)
}

const before = await state('animetosho')
console.log('before:', before.enabled)
const off = await invoke('extensions/toggle', { method: 'POST', body: { id: 'animetosho', enabled: false } })
console.log('off ->', JSON.stringify(off).slice(0, 140))
console.log('after off:', (await state('animetosho')).enabled)
const on = await invoke('extensions/toggle', { method: 'POST', body: { id: 'animetosho', enabled: true } })
console.log('on ->', JSON.stringify(on).slice(0, 140))
console.log('after on:', (await state('animetosho')).enabled)
