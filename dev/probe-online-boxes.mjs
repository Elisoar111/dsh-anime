/**
 * What the host really sends for one online episode: box layout, and whether
 * any box carries a duration. Driven straight against the route table, so no
 * app is needed.
 *
 *   node dev/probe-online-boxes.mjs [source] [query]
 */
import { Writable } from 'node:stream'

const SOURCE = process.argv[2] ?? 'src-girigiri'
const QUERY = process.argv[3] ?? ''
const routes = new Map()
const { apply } = await import('../index.js')
apply({
  inject: (_deps, callback) =>
    callback({ webServer: { register: (route) => (routes.set(route.path, route), () => {}) } }),
})
const at = (path) => {
  const route = routes.get(path)
  if (route === undefined) throw new Error(`route missing: ${path}`)
  return route
}

const json = async (path, query) => {
  let body = ''
  const response = {
    writeHead: () => {},
    setHeader: () => {},
    end: (chunk) => {
      if (chunk !== undefined) body += chunk
    },
    on: () => {},
    once: () => {},
  }
  await at(path).handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, response)
  try {
    return JSON.parse(body)
  } catch {
    return { ok: false, error: { message: body.slice(0, 200) } }
  }
}

const sources = await json('/dsh-anime/api/online/sources', '')
const list = (sources?.data?.items ?? sources?.data ?? []).map((item) => item.id ?? item.source)
console.log('sources', JSON.stringify(list))

const search = await json('/dsh-anime/api/online/search', `source=${SOURCE}&keyword=${encodeURIComponent('柯南')}`)
const hits = search?.data?.items ?? []
console.log('search', hits.length, hits[0]?.name ?? hits[0]?.title, hits[0]?.id ?? '')
if (hits.length === 0) process.exit(0)

const detail = hits[0]
const episodes = await json(
  '/dsh-anime/api/online/episodes',
  `source=${SOURCE}&id=${encodeURIComponent(detail.id)}&server=${encodeURIComponent(detail.servers?.[0]?.id ?? '')}`,
)
const eps = episodes?.data?.items ?? []
console.log('episodes', eps.length, eps[0]?.id ?? eps[0]?.name)
if (eps.length === 0) process.exit(0)

const path = `/dsh-anime/api/online/stream?source=${SOURCE}&episode=${encodeURIComponent(eps[0].id)}${QUERY === '' ? '' : `&${QUERY}`}`
console.log('GET', path)
const started = Date.now()
const boxes = []
let pending = Buffer.alloc(0)
let bytes = 0
let head = null
const sink = new Writable({
  write(chunk, _encoding, callback) {
    bytes += chunk.byteLength
    if (head === null) head = Buffer.from(chunk.subarray(0, 64))
    pending = Buffer.concat([pending, Buffer.from(chunk)])
    for (;;) {
      if (pending.length < 8) break
      let size = pending.readUInt32BE(0)
      const type = pending.subarray(4, 8).toString('latin1')
      let header = 8
      if (size === 1) {
        if (pending.length < 16) break
        size = Number(pending.readBigUInt64BE(8))
        header = 16
      } else if (size === 0) {
        size = pending.length
      }
      if (pending.length < size) break
      const body = pending.subarray(header, size)
      if (boxes.length < 40) {
        const box = { type, size }
        if (type === 'moov' || type === 'moof') box.children = []
        // mvhd: version(1) flags(3) ctime ... duration at +16 (v0) / +24 (v1), timescale before
        if (type === 'moov') {
          const index = body.indexOf(Buffer.from('mvhd', 'latin1'))
          if (index > 0) {
            const mvhd = body.subarray(index + 4)
            const version = mvhd.readUInt8(0)
            if (version === 0) {
              box.timescale = mvhd.readUInt32BE(4 + 8)
              box.duration = mvhd.readUInt32BE(4 + 12)
            } else {
              box.timescale = mvhd.readUInt32BE(4 + 16)
              box.duration = Number(mvhd.readBigUInt64BE(4 + 20))
            }
          }
          const mvex = body.indexOf(Buffer.from('mvex', 'latin1'))
          box.fragmented = mvex > 0
          for (const fourcc of ['avc1', 'hvc1', 'hev1', 'av01', 'mp4a', 'ac-3', 'ec-3']) {
            if (body.indexOf(Buffer.from(fourcc, 'latin1')) > 0) (box.codecs ??= []).push(fourcc)
          }
        }
        if (type === 'moof') {
          const tfdt = body.indexOf(Buffer.from('tfdt', 'latin1'))
          if (tfdt > 0) {
            const v = body.readUInt8(tfdt + 4)
            box.tfdt = v === 0 ? body.readUInt32BE(tfdt + 8) : Number(body.readBigUInt64BE(tfdt + 8))
          }
          const tfhd = body.indexOf(Buffer.from('tfhd', 'latin1'))
          if (tfhd > 0) box.trackId = body.readUInt32BE(tfhd + 8)
        }
        boxes.push(box)
      }
      pending = pending.subarray(size)
    }
    callback()
  },
})

await new Promise((resolve) => {
  at(path)
    .handler({ method: 'GET', url: path, headers: {} }, sink)
    .then(() => {})
    .catch((error) => console.log('handler threw', String(error?.message ?? error)))
  const timer = setInterval(() => {
    if (bytes > 6 * 1024 * 1024 || Date.now() - started > 6000) {
      clearInterval(timer)
      try {
        sink.destroy()
      } catch {
        /* gone */
      }
      resolve()
    }
  }, 200)
})
console.log(`bytes=${bytes} in ${Math.round((Date.now() - started) / 100) / 10}s head=${JSON.stringify(head?.subarray(4, 8).toString('latin1') ?? '')}`)
console.log('boxes', JSON.stringify(boxes.slice(0, 12)))
const types = boxes.map((box) => box.type)
console.log('sequence', types.slice(0, 20).join(' '))
