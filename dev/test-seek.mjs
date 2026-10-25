// Does the bilibili proxy actually let a <video> seek? Ask for a slice in the
// middle of the file and compare with what a browser would need.
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
  await handler(request, response)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const json = async (path) => (await fetch(`${base}${path}`)).json()

const search = await json('/dsh-anime/api/bili/search?q=' + encodeURIComponent('葬送的芙莉莲'))
const season = await json(`/dsh-anime/api/bili/season?season_id=${search.data.items[0].seasonId}`)
const ep = season.data.episodes[0]
const play = await json(`/dsh-anime/api/bili/episode?ep_id=${ep.epId}&cid=${ep.cid}&qn=64`)
const src = play.data.src
console.log('src', src, 'size', play.data.size)

async function head(path, headers) {
  const response = await fetch(`${base}${path}`, { headers })
  const array = new Uint8Array(await response.arrayBuffer())
  return { status: response.status, headers: Object.fromEntries(response.headers), bytes: array.length, magic: Buffer.from(array.slice(0, 12)).toString('hex') }
}

// 1. what the browser sends first
const first = await head(src, { range: 'bytes=0-' })
console.log('\n[bytes=0-]', first.status, first.headers['content-length'], first.headers['content-range'], first.bytes)

// 2. an open-ended range from the middle (what a seek does)
const mid = await head(src, { range: 'bytes=10000000-' })
console.log('[bytes=10000000-]', mid.status, mid.headers['content-length'], mid.headers['content-range'], mid.bytes)

// 3. a tight slice (what the browser uses to read the moov box at the end)
const tail = await head(src, { range: `bytes=${play.data.size - 2048}-${play.data.size - 1}` })
console.log('[tail 2k]', tail.status, tail.headers['content-length'], tail.headers['content-range'], tail.bytes)

// 4. how big the header block is: browsers scan the first bytes for ftyp/moov
const header = await head(src, { range: 'bytes=0-65535' })
console.log('[head 64k]', header.status, header.bytes, 'has moov:', false)

server.close()
