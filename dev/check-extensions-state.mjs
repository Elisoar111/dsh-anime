import { apply } from '../index.js'

const routes = new Map()
apply({
  inject(_deps, fn) {
    fn({ webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } }, loader: {} })
  },
  logger: { info() {}, warn() {}, error() {} },
})

const chunks = []
const res = { writeHead() {}, setHeader() {}, end(b) { if (b !== undefined) chunks.push(String(b)) }, write(c) { chunks.push(String(c)) } }
await routes.get('/dsh-anime/api/extensions')(
  { method: 'GET', url: '/dsh-anime/api/extensions', headers: {}, socket: {}, on() {}, once() {}, resume() {} },
  res,
)
const payload = JSON.parse(chunks.join(''))
const items = (payload.data ?? payload).items
for (const item of items) {
  console.log(`${item.id.padEnd(11)} ${item.type.padEnd(8)} enabled=${item.enabled}  ${item.settings.map((s) => s.key).join(',')}`)
}
