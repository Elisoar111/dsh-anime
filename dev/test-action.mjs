/** Exercise the GET action channel against the real handlers. */
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

async function invoke(name, { method = 'GET', query = '' } = {}) {
  const base = `/dsh-anime/api/${name}`
  const handler = routes.get(base)
  if (handler === undefined) throw new Error(`no route ${base}`)
  const request = Readable.from([])
  request.method = method
  request.url = `http://local${base}${query}`
  request.headers = { 'content-type': 'application/json', host: 'local' }
  const response = fakeResponse()
  await handler(request, response)
  await new Promise((resolve) => setTimeout(resolve, 60))
  const text = response.bodyText()
  return text === '' ? null : JSON.parse(text)
}

const items = async () => {
  const listed = await invoke('extensions')
  return (listed?.data?.items ?? listed?.items ?? []).map((item) => `${item.id}:${item.enabled}`).join(' ')
}

console.log('before  ', await items())

const payload = encodeURIComponent(JSON.stringify({ id: 'animetosho', enabled: false }))
const off = await invoke('action', { query: `?name=${encodeURIComponent('extensions/toggle')}&payload=${payload}` })
console.log('action ->', JSON.stringify(off).slice(0, 120))
console.log('after off', await items())

const on = encodeURIComponent(JSON.stringify({ id: 'animetosho', enabled: true }))
const back = await invoke('action', { query: `?name=${encodeURIComponent('extensions/toggle')}&payload=${on}` })
console.log('action ->', JSON.stringify(back).slice(0, 120))
console.log('after on ', await items())
