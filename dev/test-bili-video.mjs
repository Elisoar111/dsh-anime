/**
 * User-upload (投稿视频) routes: search, metadata, and the media stream.
 *   node dev/test-bili-video.mjs
 *
 * The media route pipes into a real Writable, exactly like ServerResponse.
 */
import { Writable } from 'node:stream'
import { apply } from '../index.js'

const routes = new Map()
const fakeCtx = {
  inject(deps, callback) {
    callback({ webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } } })
  },
}
apply(fakeCtx)

function call(path, { query = '', method = 'GET', headers = {} } = {}) {
  const route = routes.get(`/dsh-anime/api/${path}`)
  if (route === undefined) return Promise.reject(new Error(`no route /dsh-anime/api/${path}`))

  const chunks = []
  const finish = { status: 0, headers: null, body: Buffer.alloc(0), done: null }
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    },
  })
  let resolveDone
  finish.done = new Promise((resolve) => {
    resolveDone = resolve
  })

  const response = Object.assign(sink, {
    statusCode: 200,
    writeHead(status, header) {
      finish.status = status
      finish.headers = header
      return this
    },
    flushHeaders() {},
    get headersSent() {
      return finish.status !== 0
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      finish.body = Buffer.concat(chunks)
      Writable.prototype.end.call(this)
      resolveDone()
      return this
    },
  })

  const request = { method, url: `/dsh-anime/api/${path}${query ? `?${query}` : ''}`, headers }
  const started = Promise.resolve(route.handler(request, response)).catch((error) => {
    finish.error = error
  })
  // Media routes finish when the pipe drains; JSON routes when end() runs.
  return Promise.race([
    started.then(() => finish.done.catch(() => undefined)).then(() => finish),
    started.then(async () => {
      const wait = new Promise((resolve) => setTimeout(resolve, 4000))
      await Promise.race([finish.done, wait])
      return finish
    }),
  ]).then(() => {
    if (finish.body.length === 0) finish.body = Buffer.concat(chunks)
    return finish
  })
}

function json(result) {
  try {
    return JSON.parse(result.body.toString('utf8'))
  } catch {
    return null
  }
}

const term = encodeURIComponent('孤独摇滚')
const started = Date.now()
const videos = await call('bili/videos', { query: `keyword=${term}&page=1` })
const payload = json(videos)
console.log(
  'bili/videos',
  videos.status,
  `${Date.now() - started}ms`,
  'ok=' + payload?.ok,
  'total=' + payload?.data?.total,
  'items=' + (payload?.data?.items?.length ?? 0),
)
const first = payload?.data?.items?.[0]
console.log('  first:', first?.bvid, '|', first?.title?.slice(0, 46), '|', first?.author, '|', first?.duration)
if (payload?.ok !== true) console.log('  error:', payload?.error ?? payload?.raw)

const bvid = first?.bvid ?? 'BV1GJ411x7h7'
const view = await call('bili/video', { query: `bvid=${bvid}` })
const detail = json(view)
console.log('\nbili/video', view.status, 'ok=' + detail?.ok, 'pages=' + (detail?.data?.pages?.length ?? 0))
console.log('  title:', JSON.stringify(detail?.data?.title?.slice(0, 40)))
console.log('  parts:', detail?.data?.pages?.slice(0, 3).map((part) => `P${part.page}:${part.part.slice(0, 20)}`))
if (detail?.ok !== true) console.log('  error:', detail?.error ?? detail?.raw)

const cid = detail?.data?.pages?.[0]?.cid ?? 137649199
const streamStarted = Date.now()
const stream = await call('bili/stream', { query: `bvid=${bvid}&cid=${cid}&qn=64`, headers: { range: 'bytes=0-4095' } })
console.log(
  '\nbili/stream range',
  `${Date.now() - streamStarted}ms`,
  'bytes=' + stream.body.length,
  'type=' + stream.headers?.['content-type'],
  'range=' + stream.headers?.['content-range'],
  'magic=' + stream.body.subarray(4, 12).toString('hex'),
)
if (String(stream.headers?.['content-type']).includes('json')) console.log('  body:', stream.body.toString('utf8').slice(0, 300))

const fullStarted = Date.now()
const full = await call('bili/stream', { query: `bvid=${bvid}&cid=${cid}&qn=16` })
console.log(
  '\nbili/stream full',
  `${Date.now() - fullStarted}ms`,
  'bytes=' + full.body.length,
  'expect=' + full.headers?.['content-length'],
  'type=' + full.headers?.['content-type'],
)
