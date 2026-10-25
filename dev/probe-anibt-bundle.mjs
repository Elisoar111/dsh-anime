/**
 * Development probe #2: AniBT is a Vite single-page app, so the data layer is
 * in the bundle. Look for the JSON endpoints it calls.
 *
 *   node dev/probe-anibt-bundle.mjs
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BUNDLE = 'https://www.anibt.net/assets/index-DYXAKJ5w.js'

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 120000)
let text = ''
let status = 0
try {
  const response = await fetch(BUNDLE, { signal: controller.signal, headers: { 'user-agent': UA } })
  status = response.status
  text = await response.text()
} catch (error) {
  console.log('bundle fetch failed:', error.name, error.message)
} finally {
  clearTimeout(timer)
}

console.log('bundle:', status, text.length, 'bytes')
if (text.length === 0) process.exit(0)

const uniq = (list) => [...new Set(list)]

const endpoints = uniq([
  ...[...text.matchAll(/["'`](\/(?:api|v\d|anime|episode|stream|search|bgm)[a-zA-Z0-9_\-/]{0,60})["'`]/g)].map((m) => m[1]),
])
console.log('\ncandidate endpoints (' + endpoints.length + '):')
console.log(endpoints.slice(0, 120).map((path) => '  ' + path).join('\n'))

for (const keyword of ['m3u8', 'playlist', 'streamUrl', 'video_url', 'videoUrl', 'hls', 'dash', 'magnet', 'torrent', 'mikan', 'acg.rip', 'nyaa', 'anibt.net/api', 'api.anibt']) {
  const hits = text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
  console.log(`keyword ${keyword}: ${hits ? hits.length : 0}`)
}

const absolute = uniq([...text.matchAll(/https?:\/\/[a-zA-Z0-9.\-]*(?:anibt|r2\.anibt)[a-zA-Z0-9.\-]*\/[a-zA-Z0-9_\-/.?=&%{}:]*/g)].map((m) => m[0]))
console.log('\nanibt URLs (' + absolute.length + '):')
console.log(absolute.slice(0, 40).map((u) => '  ' + u).join('\n'))

// Any distinctive strings near "api" to guess the base path.
const baseApi = uniq([...text.matchAll(/["'`](https?:\/\/[^"'`]{4,80})["'`]/g)].map((m) => m[1])).filter((u) => /api|backend|server|cors/.test(u))
console.log('\napi-ish base URLs:')
console.log(baseApi.slice(0, 30).map((u) => '  ' + u).join('\n'))
