/**
 * Does switching a data source off actually stop its routes answering?
 *
 *   node dev/probe-guard.mjs [extensionId]
 *
 * Turns the extension off, asks its route, turns it back on, and reports both
 * the status codes and whether the enabled state was restored.
 */
import { apply } from '../index.js'

const target = process.argv[2] ?? 'animeko'
const routes = new Map()
apply({
  inject(_deps, callback) {
    callback({
      webServer: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    })
  },
})

async function call(name, payload, method = 'GET') {
  const route = routes.get(`/dsh-anime/api/${name}`)
  if (route === undefined) return { status: 'no-route', body: '' }
  const query = payload === undefined ? '' : `?payload=${encodeURIComponent(JSON.stringify(payload))}`
  const out = { status: 0, body: '' }
  await route.handler(
    { method, url: `/dsh-anime/api/${name}${query}`, headers: { host: '127.0.0.1:17448' } },
    {
      writeHead(status) {
        out.status = status
      },
      end(chunk) {
        if (chunk !== undefined) out.body += String(chunk)
      },
    },
  )
  return out
}

const routeName = `${target}/season`
const before = await call(routeName)
const off = await call('extensions/toggle', { id: target, enabled: false })
const disabled = await call(routeName)
const on = await call('extensions/toggle', { id: target, enabled: true })
const after = await call(routeName)

const brief = (result) => {
  let json = null
  try {
    json = JSON.parse(result.body)
  } catch {
    json = null
  }
  const extra = json === null ? '' : ` ok=${json.ok} ${json.error?.message ?? ''}`
  return `HTTP ${result.status}${extra}`
}

console.log(`enabled  ${routeName}: ${brief(before)}`)
console.log(`toggle off: ${brief(off)}`)
console.log(`disabled ${routeName}: ${brief(disabled)}`)
console.log(`toggle on : ${brief(on)}`)
console.log(`enabled  ${routeName}: ${brief(after)}`)

// Upstream and guard failures are reported as HTTP 200 with ok=false (the page
// shows the message), so "guarded" means the answer is no longer ok=true.
const guarded = brief(disabled) !== 'HTTP 200 ok=true '
const restored = brief(after) === 'HTTP 200 ok=true '
console.log(guarded && restored ? 'PASS  a disabled source stops answering and comes back' : 'FAIL  guard did not behave')
process.exit(guarded && restored ? 0 : 1)
