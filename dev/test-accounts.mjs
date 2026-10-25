// Accounts: status, QR generation, bad-token rejection, and the token plumbing.
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
  // The route itself reads the JSON body; consuming it here would starve it.
  await handler(request, response)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/dsh-anime/api`

const get = async (path) => {
  const t0 = Date.now()
  const response = await fetch(`${base}${path}`)
  return { status: response.status, ms: Date.now() - t0, body: await response.json().catch(() => null) }
}
const post = async (path, payload) => {
  const t0 = Date.now()
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: response.status, ms: Date.now() - t0, body: await response.json().catch(() => null) }
}

const status = await get('/accounts')
console.log('accounts:', status.status, status.ms + 'ms', JSON.stringify(status.body?.data?.accounts))

const qr = await post('/accounts/qr', {})
console.log('\nqr generate:', qr.status, qr.ms + 'ms', qr.body?.data?.url?.slice(0, 70), 'key:', qr.body?.data?.key?.slice(0, 12) + '…')

if (qr.body?.data?.key) {
  const poll = await get(`/accounts/qr/status?key=${encodeURIComponent(qr.body.data.key)}`)
  console.log('qr poll (fresh):', poll.status, poll.body?.data?.state ?? poll.body?.state, poll.body?.data?.message ?? poll.body?.message ?? '')
}

const badAniList = await post('/accounts/save', { provider: 'anilist', value: 'definitely-not-a-token' })
console.log('\nsave bad anilist:', badAniList.status, badAniList.ms + 'ms', JSON.stringify(badAniList.body))

const badBili = await post('/accounts/save', { provider: 'bilibili', value: 'SESSDATA=deadbeef' })
console.log('save bad bilibili:', badBili.status, badBili.ms + 'ms', JSON.stringify(badBili.body))

const badBangumi = await post('/accounts/save', { provider: 'bangumi', value: 'nope' })
console.log('save bad bangumi:', badBangumi.status, badBangumi.ms + 'ms', JSON.stringify(badBangumi.body))

const unknown = await post('/accounts/save', { provider: 'netflix', value: 'x' })
console.log('save unknown provider:', unknown.status, JSON.stringify(unknown.body))

const logout = await post('/accounts/logout', { provider: 'anilist' })
console.log('logout anilist:', logout.status, JSON.stringify(logout.body?.data?.accounts?.anilist ?? logout.body))

server.close()
