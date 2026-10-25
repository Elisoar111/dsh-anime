/**
 * Development check for the settings + downloads routes.
 *
 *   node dev/test-settings-routes.mjs
 */
import { EventEmitter } from 'node:events'
import { apply } from '../index.js'

const routes = new Map()
const fakeCtx = {
  inject(deps, callback) {
    callback({ webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } })
  },
}
apply(fakeCtx)

function call(path, { method = 'GET', body = null, query = '' } = {}) {
  const route = routes.get(`/dsh-anime/api/${path}`)
  if (route === undefined) return Promise.reject(new Error(`no route /dsh-anime/api/${path}`))
  const target = { status: 0, headers: null, body: '' }
  const response = {
    writeHead(status, headers) { target.status = status; target.headers = headers },
    end(chunk) { if (chunk !== undefined) target.body += String(chunk) },
    setHeader() {},
    getHeader() { return undefined },
  }
  const request = new EventEmitter()
  request.method = method
  request.url = `/dsh-anime/api/${path}${query ? `?${query}` : ''}`
  request.headers = body === null ? {} : { 'content-type': 'application/json' }
  const payload = body === null ? null : Buffer.from(JSON.stringify(body))
  if (payload !== null) {
    request.headers['content-length'] = String(payload.length)
    setImmediate(() => {
      request.emit('data', payload)
      request.emit('end')
    })
  } else {
    setImmediate(() => request.emit('end'))
  }
  return Promise.resolve(route.handler(request, response)).then(() => {
    let parsed = null
    try {
      parsed = JSON.parse(target.body)
    } catch {
      parsed = target.body.slice(0, 300)
    }
    return { status: target.status, json: parsed }
  })
}

const show = (label, value) => console.log(`\n### ${label}\n${JSON.stringify(value, null, 2).slice(0, 1200)}`)

const settings = await call('settings')
show('GET settings', {
  status: settings.status,
  quality: settings.json?.data?.settings?.stream?.quality,
  players: settings.json?.data?.players,
  ffmpeg: settings.json?.data?.ffmpeg,
  downloadDir: settings.json?.data?.paths?.downloadDir,
})

const saved = await call('settings/save', { method: 'POST', body: { stream: { quality: 80, autoNext: false } } })
show('POST settings/save', {
  status: saved.status,
  quality: saved.json?.data?.settings?.stream?.quality,
  autoNext: saved.json?.data?.settings?.stream?.autoNext,
  raw: saved.json?.data === undefined ? saved.json : undefined,
})

const downloads = await call('downloads')
show('GET downloads', { status: downloads.status, jobs: downloads.json?.data?.jobs?.length, stats: downloads.json?.data?.stats })

const started = await call('downloads/bili', {
  method: 'POST',
  body: { ep_id: 779775, cid: 1339446971, qn: 16, title: 'dsh-anime download test' },
})
show('POST downloads/bili', started.json?.data ?? started.json)

const id = started.json?.data?.id ?? null
if (id !== null) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const listed = await call('downloads')
  show('after 5s', listed.json?.data?.jobs?.find((entry) => entry.id === id) ?? null)
  show('POST downloads/cancel', (await call('downloads/cancel', { method: 'POST', body: { id } })).json)
  show('POST downloads/remove', (await call('downloads/remove', { method: 'POST', body: { id } })).json)
}

const reset = await call('settings/reset', { method: 'POST', body: {} })
show('POST settings/reset', { quality: reset.json?.data?.settings?.stream?.quality, raw: reset.json?.data === undefined ? reset.json : undefined })
