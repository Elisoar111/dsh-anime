/**
 * Why does FQDM's 番茄2线 show a black screen?
 *
 * The line is one of five the site publishes (lib/fqdm.js), but the play page
 * shows nothing after switching to it. Three separate things can produce a
 * black frame and they look identical from the outside, so this walks the
 * whole chain and reports where it stops:
 *
 *   1. the line list and episode ids for a real title (真实 detail 页)
 *   2. `resolve` on that line — is there a playable URL at all?
 *   3. the playlist itself — master or media, how many segments, total length
 *   4. `/online/stream` — status / content-type / first bytes, with a Range probe
 *
 *   node dev/probe-fqdm-line.mjs [animeId] [line]
 */
const PORT = process.env.DSH_PORT || '40070'
const API = `http://127.0.0.1:${PORT}/dsh-anime/api`
const ANIME = process.argv[2] || '2145'
const LINE = process.argv[3] || '番茄2线'

const t0 = Date.now()
const mark = (label) => console.log(`\n== ${label} (+${((Date.now() - t0) / 1000).toFixed(1)}s)`)

async function api(path, timeout = 90_000) {
  const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(timeout) })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: response.status, body }
}

mark(`1. 线路表 for ${ANIME}`)
const servers = await api(`/online/servers?source=fqdm&id=${ANIME}`)
const lines = servers.body?.data?.items ?? servers.body?.data?.servers ?? []
console.log(`   HTTP ${servers.status}, ${lines.length} 条:`, JSON.stringify(lines).slice(0, 400))
const line = lines.map((item) => item.name ?? item).includes(LINE) ? LINE : lines[0]?.name ?? LINE
console.log(`   用这条: ${line}`)

mark(`2. episodes line=${line}`)
const episodes = await api(`/online/episodes?source=fqdm&id=${ANIME}&server=${encodeURIComponent(line)}`)
const items = episodes.body?.data?.items ?? []
console.log(`   HTTP ${episodes.status}, ${items.length} 集, 前 3:`, JSON.stringify(items.slice(0, 3)))
if (items.length === 0) {
  console.log('   这条线路没有集数 —— 界面会是“空白列表”，不是黑屏')
  process.exit(0)
}
const episodeId = items[0].id

mark(`3. resolve + duration for ${episodeId}`)
const duration = await api(
  `/online/duration?source=fqdm&episode=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(line)}`,
  60_000,
)
console.log(`   duration HTTP ${duration.status}:`, JSON.stringify(duration.body).slice(0, 300))

mark('4. /online/stream')
const started = Date.now()
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 60_000)
let first = null
try {
  const response = await fetch(
    `${API}/online/stream?source=fqdm&episode=${encodeURIComponent(episodeId)}&server=${encodeURIComponent(line)}`,
    { signal: controller.signal },
  )
  const type = response.headers.get('content-type')
  const length = response.headers.get('content-length')
  const ranges = response.headers.get('accept-ranges')
  const reader = response.body.getReader()
  const chunk = await reader.read()
  first = chunk.value ?? new Uint8Array()
  await reader.cancel().catch(() => {})
  console.log(
    `   HTTP ${response.status} type=${type} len=${length} ranges=${ranges} first=${first.length}B after ${(
      (Date.now() - started) /
      1000
    ).toFixed(1)}s`,
  )
  console.log(
    `   head: ${Buffer.from(first.slice(0, 16)).toString('hex')}  ascii=${JSON.stringify(
      Buffer.from(first.slice(0, 16)).toString('latin1'),
    )}`,
  )
} catch (error) {
  console.log(`   thrown: ${error?.name} ${error?.message}`)
} finally {
  clearTimeout(timer)
}
