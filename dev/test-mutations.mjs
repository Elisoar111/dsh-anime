/**
 * Probe the mutation routes the way the desktop shell delivers them.
 *
 * The dsh desktop shell hands a POST to the host as a GET, so the plugin's
 * mutation routes must answer GET with ?payload=<json> as well. This script
 * drives the registered routes directly and prints what the page would get.
 *
 *   node dev/test-mutations.mjs [actionName ...]
 */
import { apply } from '../index.js'

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

async function call(action, payload = {}, method = 'GET') {
  const route = routes.get(`/dsh-anime/api/${action}`)
  if (route === undefined) return { status: 'no-route' }
  const target = { status: 0, body: '' }
  const query =
    method === 'GET' ? `?payload=${encodeURIComponent(JSON.stringify(payload))}` : ''
  const request = {
    method,
    url: `/dsh-anime/api/${action}${query}`,
    headers: { host: '127.0.0.1:17448' },
  }
  const response = {
    writeHead(status) {
      target.status = status
    },
    end(chunk) {
      if (chunk !== undefined) target.body += String(chunk)
    },
  }
  await route.handler(request, response)
  return target
}

// Each argument is `name` or `name={"json":...}`, so a mutation that needs a
// body can be driven from the command line.
const wanted = process.argv.slice(2)
const cases = wanted.length > 0 ? wanted : ['accounts/qr']
for (const spec of cases) {
  const brace = spec.indexOf('=')
  const action = brace === -1 ? spec : spec.slice(0, brace)
  let payload = {}
  if (brace !== -1) {
    const raw = spec.slice(brace + 1)
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      console.log(`FAIL  ${action}: payload is not JSON (${error.message})`)
      continue
    }
  }
  const started = Date.now()
  const result = await call(action, payload)
  const took = Date.now() - started
  let json = null
  try {
    json = JSON.parse(result.body)
  } catch {
    json = null
  }
  const summary = json === null ? String(result.body).slice(0, 200) : JSON.stringify(json).slice(0, 300)
  console.log(`[${took}ms] ${action} — HTTP ${result.status} — ${summary}`)
}
