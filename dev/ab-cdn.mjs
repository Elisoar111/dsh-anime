/**
 * A/B test one DASH representation at a time.
 *
 * Round 1 proved playurl (with WBI) returns the whole ladder and two backup
 * mirrors. This pulls a single URL for N seconds and reports how the bytes
 * actually arrived: stalls, gaps and total, so "10 秒就停" can be pinned to a
 * host / representation instead of guessed.
 *
 *   node --use-system-ca dev/ab-cdn.mjs [seconds] [qn]
 */
const SECONDS = Number(process.argv[2] ?? 60)
const QN = Number(process.argv[3] ?? 80)

const routes = new Map()
const { apply } = await import('../index.js')
apply({ inject: (_deps, cb) => cb({ webServer: { register: (route) => { routes.set(route.path, route); return () => {} } } }) })

const route = routes.get('/dsh-anime/api/bili/stream')
if (route === undefined) throw new Error('stream route missing')

async function manifest(bvid, cid, qn) {
  let body = ''
  const res = {
    writeHead: () => {},
    setHeader: () => {},
    end: (chunk) => { if (chunk !== undefined) body += chunk },
    on: () => {},
    once: () => {},
  }
  await route.handler(
    { method: 'GET', url: `/dsh-anime/api/bili/stream?bvid=${bvid}&cid=${cid}&qn=${qn}&format=manifest`, headers: {} },
    res,
  )
  return JSON.parse(body)
}

/** Pull one url for `seconds`, sampling every second. */
async function pull(url, seconds) {
  const samples = []
  const started = Date.now()
  let bytes = 0
  let lastAt = started
  let biggestGap = 0
  const controller = new AbortController()
  const stop = setTimeout(() => controller.abort(), seconds * 1000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { referer: 'https://www.bilibili.com', 'user-agent': 'Mozilla/5.0' },
    })
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      const now = Date.now()
      const gap = now - lastAt
      if (gap > biggestGap) biggestGap = gap
      lastAt = now
      samples.push({ at: now - started, bytes })
    }
  } catch (error) {
    samples.push({ at: Date.now() - started, bytes, error: String(error?.name ?? error) })
  } finally {
    clearTimeout(stop)
  }
  const seconds_run = (Date.now() - started) / 1000
  // A stall is a stretch of ≥2s where nothing arrived while the body was open.
  let stalls = 0
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].at - samples[index - 1].at >= 2000) stalls += 1
  }
  return {
    seconds: Math.round(seconds_run * 10) / 10,
    mb: Math.round((bytes / 1024 / 1024) * 10) / 10,
    stalls,
    biggestGapMs: biggestGap,
    ended: samples.some((entry) => entry.error !== undefined) ? 'aborted' : samples.length > 1 ? 'stream-end' : 'empty',
  }
}

const BVID = 'BV1xZpE6dEEn'
const CID = 42649651705
const data = await manifest(BVID, CID, QN)
if (data.ok !== true) throw new Error('manifest failed: ' + JSON.stringify(data).slice(0, 200))

const targets = [
  { label: `primary id=${data.videoId} codecid=${data.videoCodecid}`, url: new URL(data.videoRaw).host },
  ...[],
]
const videoUrl = data.videoRaw
const alternates = Array.isArray(data.videoBackup) ? data.videoBackup : []
const rows = []
const candidates = [{ kind: 'primary', url: videoUrl }, ...alternates.map((url, index) => ({ kind: `backup${index + 1}`, url }))]
for (const candidate of candidates) {
  const host = new URL(candidate.url).host
  const file = new URL(candidate.url).pathname.split('/').pop()
  const result = await pull(candidate.url, SECONDS)
  rows.push({ kind: candidate.kind, host, file, ...result })
  console.log(`${candidate.kind.padEnd(8)} ${host.padEnd(34)} ${file.padEnd(28)} ${result.mb}MB/${result.seconds}s stalls=${result.stalls} gap=${result.biggestGapMs}ms ${result.ended}`)
}
console.log('---')
console.log(JSON.stringify({ bvid: BVID, cid: CID, qn: QN, videoId: data.videoId, videoCodecid: data.videoCodecid, seconds: SECONDS, rows }, null, 2))
