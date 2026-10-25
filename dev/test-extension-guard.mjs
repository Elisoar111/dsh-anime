/** Verifies the account binding and the "disabled data source" guard. */
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const routes = new Map()
apply({
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
})

const prefix = '/dsh-anime/api'
function fakeResponse() {
  const chunks = []
  const res = new Readable({ read() {} })
  res.writeHead = () => res
  res.setHeader = () => res
  res.end = (body) => {
    if (body !== undefined) chunks.push(Buffer.from(String(body)))
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

const listed = await invoke('extensions')
const items = listed?.data?.items ?? []
console.log('account bindings:', items.filter((item) => item.account !== '').map((item) => `${item.id}->${item.account}`))

await invoke('extensions/toggle', { method: 'POST', body: { id: 'anilist', enabled: false } })
const blocked = await invoke('anilist/season', { query: { season: 'WINTER', year: 2026 } })
console.log('disabled anilist:', JSON.stringify({ status: blocked?.status, ok: blocked?.ok, message: blocked?.error?.message ?? blocked?.data?.error?.message }))
await invoke('extensions/toggle', { method: 'POST', body: { id: 'anilist', enabled: true } })
const again = await invoke('anilist/season', { query: { season: 'WINTER', year: 2026 } })
console.log('re-enabled anilist ok:', again?.ok === true)
