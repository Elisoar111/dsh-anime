/**
 * Prints exactly what the account panel receives, per provider.
 *
 *   node --use-system-ca dev/probe-accounts.mjs
 */
import { apply } from '../index.js'

const routes = new Map()
const fakeCtx = {
  inject(deps, callback) {
    callback({ webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } })
  },
}
apply(fakeCtx)

const route = routes.get('/dsh-anime/api/accounts')
if (route === undefined) throw new Error('accounts route missing')
const target = { status: 0, body: '' }
await route.handler(
  { method: 'GET', url: '/dsh-anime/api/accounts' },
  { writeHead(status) { target.status = status }, end(chunk) { if (chunk !== undefined) target.body += String(chunk) } },
)

const payload = JSON.parse(target.body)
if (payload.ok === false) {
  console.log('FAILED', payload.error)
  process.exit(1)
}
for (const [id, account] of Object.entries(payload.data?.accounts ?? {})) {
  const user = account?.user ?? {}
  const loggedIn = account?.loggedIn === true
  console.log(
    `${id.padEnd(10)} loggedIn=${String(loggedIn).padEnd(5)} name=${JSON.stringify(user.name ?? user.nickname ?? null)} face=${user.face ? String(user.face).slice(0, 60) : null}`,
  )
}
