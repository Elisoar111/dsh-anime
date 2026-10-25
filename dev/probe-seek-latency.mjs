/**
 * How long does a seek actually take on the host side?
 *
 * The page rebuilds MSE from `?start=<second>`, and the host answers that with
 * `ffmpeg -ss ... -i <remote m4s>` while `createTranscodeStream` first runs a
 * full `ffprobe` on the same URL. This measures both halves separately so a
 * slow drag can be attributed instead of guessed:
 *
 *   node dev/probe-seek-latency.mjs [start] [seconds]
 */
import { spawn } from 'node:child_process'

const START = Number(process.argv[2] ?? 600)
const SECONDS = Number(process.argv[3] ?? 6)
const BVID = 'BV1xrnz6gEVD'
const CID = 42926145926

const routes = new Map()
const { apply } = await import('../index.js')
apply({
  inject: (_deps, callback) =>
    callback({ webServer: { register: (route) => (routes.set(route.path, route), () => {}) } }),
})

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
  await routes.get(path).handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, response)
  return JSON.parse(body)
}

const manifest = await json('/dsh-anime/api/bili/stream', `bvid=${BVID}&cid=${CID}&qn=80&format=manifest&start=${START}`)
if (manifest.ok !== true) throw new Error(`manifest failed: ${JSON.stringify(manifest).slice(0, 200)}`)
const headers = { referer: 'https://www.bilibili.com', 'user-agent': 'Mozilla/5.0' }

/** ffprobe on the remote m4s, exactly what createTranscodeStream does first. */
const probe = () =>
  new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-show_streams', '-of', 'json', '-i', manifest.videoRaw], {
      windowsHide: true,
    })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.on('error', (error) => resolve({ ms: Date.now() - started, error: String(error.message) }))
    child.on('exit', (code) => {
      const streams = (() => {
        try {
          return JSON.parse(out).streams ?? []
        } catch {
          return []
        }
      })()
      resolve({ ms: Date.now() - started, code, streams: streams.map((entry) => entry.codec_name) })
    })
  })

/** First byte + bytes in SECONDS for one ffmpeg invocation. */
const drain = (label, args) =>
  new Promise((resolve) => {
    const started = Date.now()
    let first = 0
    let bytes = 0
    let stderr = ''
    const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => {
      if (first === 0) first = Date.now() - started
      bytes += chunk.byteLength
    })
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(0, 4000)))
    const timer = setTimeout(() => child.kill('SIGKILL'), SECONDS * 1000)
    child.on('exit', () => {
      clearTimeout(timer)
      resolve({
        label,
        firstByteMs: first,
        mb: Math.round((bytes / 1024 / 1024) * 100) / 100,
        elapsedMs: Date.now() - started,
        stderr: stderr.trim().split('\n').slice(-2).join(' | '),
      })
    })
  })

const base = ['-hide_banner', '-loglevel', 'error', '-nostdin']
const frag = ['-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1']

console.log('probe', JSON.stringify(await probe()))
console.log(
  'video input-seek',
  JSON.stringify(await drain('video', [...base, '-ss', String(START), '-i', manifest.videoRaw, '-map', '0:v:0', '-c:v', 'copy', ...frag])),
)
console.log(
  'audio input-seek (current maps v)',
  JSON.stringify(await drain('audio', [...base, '-ss', String(START), '-i', manifest.audioRaw, '-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'copy', ...frag])),
)
console.log(
  'audio input-seek (audio-only map)',
  JSON.stringify(await drain('audio', [...base, '-ss', String(START), '-i', manifest.audioRaw, '-vn', '-map', '0:a:0', '-c:a', 'copy', ...frag])),
)
