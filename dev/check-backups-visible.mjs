import { apply } from '../index.js'

const routes = new Map()
apply({
  inject(_deps, fn) {
    fn({ webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } }, loader: {} })
  },
  logger: { info() {}, warn() {}, error() {} },
})

const read = async (path) => {
  const base = path.split('?')[0]
  const chunks = []
  const res = { writeHead() {}, setHeader() {}, end(body) { if (body !== undefined) chunks.push(String(body)) }, write(c) { chunks.push(String(c)) } }
  await routes.get(`/dsh-anime/api/${base}`)({ method: 'GET', url: `/dsh-anime/api/${path}`, headers: {}, socket: {}, on() {}, once() {}, resume() {} }, res)
  return JSON.parse(chunks.join(''))
}

for (const id of ['anilist', 'anibt']) {
  const payload = (await read(`extensions/source?id=${id}`)).data ?? (await read(`extensions/source?id=${id}`))
  const file = payload.files[0]
  console.log(`${id} · ${file.path} · backups=${file.backups.length}`, file.backups[0]?.name ?? '')
}
