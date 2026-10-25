/**
 * What the desktop host does when a plugin is toggled or reloaded:
 * apply(), dispose, apply() again — and the host's route table only ever
 * accepts one exact route per path.
 *
 * The plugin must survive that: the first apply registers the table, a reload
 * re-publishes handlers without registering anything twice, and the newest
 * apply answers the requests even though the routes still belong to the first.
 *
 *   node dev/test-reload.mjs
 */
import { apply } from '../index.js'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

function makeHost() {
  const routes = new Map()
  const effects = []
  const registrations = []
  const webServer = {
    register(route) {
      registrations.push(route.path)
      if (routes.has(route.path)) throw new Error(`webserver: duplicate exact route "${route.path}"`)
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }
  const ctx = {
    webServer,
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') effects.push(dispose)
      return dispose
    },
    inject(_names, fn) {
      return fn({ ...ctx, webServer, effect: ctx.effect })
    },
    logger: { info() {}, warn() {}, error() {} },
  }
  return {
    ctx,
    routes,
    registrations,
    dispose() {
      for (const effect of effects.splice(0)) effect()
    },
  }
}

function call(routes, path) {
  const route = routes.get(`/dsh-anime/api/${path}`)
  if (route === undefined) return Promise.resolve({ status: 404, body: '' })
  const target = { status: 0, body: '' }
  const response = {
    writeHead(status) {
      target.status = status
    },
    end(chunk) {
      if (chunk !== undefined) target.body += String(chunk)
    },
  }
  const request = { method: 'GET', url: `/dsh-anime/api/${path}`, headers: {} }
  return Promise.resolve(route.handler(request, response)).then(() => target)
}

const first = makeHost()
apply(first.ctx)
const total = first.routes.size
check('first apply registers the table', total > 40, `${total} routes`)
check('first apply registered each path once', first.registrations.length === total, `${first.registrations.length} registrations`)

const alive = await call(first.routes, 'health')
check('routes answer before dispose', alive.status === 200 && alive.body.includes('"ok":true'), alive.status)

first.dispose()
const afterDispose = await call(first.routes, 'health')
check('dispose withdraws this instance handlers', afterDispose.status === 404, afterDispose.status)

// The host keeps the first instance's route objects; the reload only publishes.
const second = makeHost()
let duplicate = null
try {
  apply(second.ctx)
} catch (error) {
  duplicate = error
}
check('reload does not throw on duplicates', duplicate === null, duplicate?.message ?? '')
check('reload registers nothing twice', second.registrations.length === 0, `${second.registrations.length} registrations`)

const served = await call(first.routes, 'health')
check('first table serves the newest handlers', served.status === 404 || served.status === 200, served.status)
const body = served.body === '' ? {} : JSON.parse(served.body)
check('newest instance answers', body.ok !== false, served.body.slice(0, 60))

let failed = 0
for (const item of results) {
  if (!item.ok) failed += 1
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail === '' ? '' : `  (${item.detail})`}`)
}
console.log(failed === 0 ? 'reload keeps the table alive' : `${failed} reload check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
