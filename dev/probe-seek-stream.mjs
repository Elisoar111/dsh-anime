/**
 * Host-side proof of the seek path PrismFlow relies on.
 *
 * The page now answers a drag with `?start=<second>` and rebuilds MSE from the
 * new manifest. That only works if the host can turn `start` into bytes
 * quickly, so this asks the real routes (no app needed) and reports:
 *
 *   1. `bili/chapters` for a PGC episode and an upload
 *   2. `bili/stream?format=manifest&start=N` -> does the manifest carry N?
 *   3. `bili/dash?start=N` -> time to first byte, bytes in 4s, first box
 *   4. `stream/cache` -> the numbers the settings page shows
 *
 *   node dev/probe-seek-stream.mjs [start]
 */
import { Writable } from 'node:stream'

const START = Number(process.argv[2] ?? 600)
const EP_ID = 459343
const EP_CID = 719207375
const BVID = 'BV1xrnz6gEVD'
const UPLOAD_CID = 42926145926

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

/** Collect a JSON route response. */
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
  return JSON.parse(body)
}

/** Read a byte-stream route for `seconds`, timing the first chunk. */
const pull = (path, query, seconds) =>
  new Promise((resolve) => {
    const state = { firstAt: 0, bytes: 0, head: null, done: false }
    const started = Date.now()
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        if (state.firstAt === 0) state.firstAt = Date.now() - started
        if (state.head === null) state.head = Buffer.from(chunk.subarray(0, 16))
        state.bytes += chunk.byteLength
        callback()
      },
    })
    const finished = () => {
      if (state.done) return
      state.done = true
      resolve({
        firstByteMs: state.firstAt,
        mb: Math.round((state.bytes / 1024 / 1024) * 100) / 100,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        head: state.head === null ? null : [...state.head.subarray(4, 8)].map((b) => String.fromCharCode(b)).join(''),
      })
    }
    sink.on('finish', finished)
    sink.on('error', finished)
    at(path)
      .handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, sink)
      .catch((error) => {
        state.done = true
        resolve({ error: String(error?.message ?? error) })
      })
    setTimeout(() => {
      try {
        sink.destroy()
      } catch {
        /* already gone */
      }
      finished()
    }, seconds * 1000)
  })

console.log('cache  ', JSON.stringify(await json('/dsh-anime/api/stream/cache', '')))
console.log('pgc    ', JSON.stringify(await json('/dsh-anime/api/bili/chapters', `ep_id=${EP_ID}&cid=${EP_CID}`)))
console.log('upload ', JSON.stringify(await json('/dsh-anime/api/bili/chapters', `bvid=${BVID}`)))

const manifest = await json('/dsh-anime/api/bili/stream', `ep_id=${EP_ID}&cid=${EP_CID}&qn=80&format=manifest&start=${START}`)
console.log('manifest(pgc 459343)', JSON.stringify({ ok: manifest.ok, start: manifest.start, duration: manifest.duration, error: manifest.error?.message }))

// That episode is served as a plain mp4, so the DASH sample comes from an
// upload instead; a real seek test needs `formatKind === 'dash'`.
const upload = await json('/dsh-anime/api/bili/stream', `bvid=${BVID}&cid=${UPLOAD_CID}&qn=80&format=manifest&start=${START}`)
console.log('manifest(upload)', JSON.stringify({ ok: upload.ok, start: upload.start, duration: upload.duration, error: upload.error?.message }))
const chosen = upload.ok === true ? upload : manifest
if (chosen.ok !== true) throw new Error(`manifest failed: ${JSON.stringify(chosen).slice(0, 200)}`)
const carries = String(chosen.video ?? '').includes(`start=${START}`)
console.log(`manifest carries start=${START}:`, carries)

const queryOf = (absolute) => {
  const parsed = new URL(absolute, 'http://dsh-anime.local')
  return parsed.search.slice(1)
}
console.log('seek video ', JSON.stringify(await pull('/dsh-anime/api/bili/dash', queryOf(chosen.video), 4)))
console.log('seek audio ', JSON.stringify(await pull('/dsh-anime/api/bili/dash', queryOf(chosen.audio), 4)))
