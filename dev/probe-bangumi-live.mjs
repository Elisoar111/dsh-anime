/**
 * Bangumi through the LIVE host, against whatever apiBase is in effect.
 *
 * The point is to answer one question with evidence instead of hope: can this
 * machine actually populate the Bangumi 番组 pages? The probe asks the routes
 * the page itself asks, so a pass here means the UI has data to draw.
 *
 * It only reads. Nothing here writes settings or touches the account store.
 *
 *   node dev/probe-bangumi-live.mjs            # host from DSH_PORT, default 40070
 *   node dev/probe-bangumi-live.mjs 43194      # explicit port
 */
const PORT = process.argv[2] || process.env.DSH_PORT || '40070'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`

/** Calendar is slow on a cold cache (19-27 s measured), so give it room. */
const TIMEOUT = 90_000

async function get(path) {
  const startedAt = Date.now()
  const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT) })
  const text = await response.text()
  const elapsed = Date.now() - startedAt
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return { status: response.status, elapsed, body: null, text }
  }
  return { status: response.status, elapsed, body, text }
}

function show(label, result, describe) {
  const mark = result.status === 200 && result.body?.ok ? 'PASS' : 'FAIL'
  const detail = result.body?.ok ? describe(result.body.data ?? {}) : JSON.stringify(result.body?.error ?? result.text?.slice(0, 80))
  console.log(`${mark}  ${label.padEnd(28)} ${String(result.status).padEnd(4)} ${String(result.elapsed).padStart(6)} ms  ${detail}`)
  return mark === 'PASS'
}

const checks = [
  ['日历 /calendar', '/bangumi/calendar', (d) => `天=${d.days?.length ?? 0} 首日=${d.days?.[0]?.weekday?.cn ?? ''} 条目=${d.days?.[0]?.items?.length ?? 0}`],
  ['搜索 进击的巨人', '/bangumi/search?q=%E8%BF%9B%E5%87%BB%E7%9A%84%E5%B7%A8%E4%BA%BA', (d) => `条=${d.items?.length ?? 0} 首条=${d.items?.[0]?.title ?? ''} 评分=${d.items?.[0]?.score ?? 'null'}`],
  ['季度 2026 FALL', '/bangumi/season?year=2026&season=FALL', (d) => `条=${d.items?.length ?? 0} 首条=${d.items?.[0]?.title ?? ''}`],
  ['详情 id=2', '/bangumi/subject?id=2', (d) => `name=${d.name ?? ''} 集数=${d.eps ?? d.totalEpisodes ?? '?'} 评分=${d.score ?? 'null'}`],
  ['集数 id=2', '/bangumi/episodes?id=2', (d) => `条=${d.items?.length ?? d.eps?.length ?? 0} 首集=${d.items?.[0]?.name ?? d.eps?.[0]?.name ?? ''}`],
]

const health = await get('/health')
const base = health.body?.data?.sources?.bangumi?.endpoint ?? '(未知)'
const build = health.body?.data?.build ?? '(未知)'
console.log(`宿主 ${BASE}   build=${build}`)
console.log(`在用 API 地址：${base}`)
if (String(base).includes('api.bgm.tv')) {
  console.log('!! 现在是官方地址，这台机器上它一定超时。把设置里的「API 地址」留空即用镜像。')
}
console.log('')

let passed = 0
for (const [label, path, describe] of checks) {
  try {
    const result = await get(path)
    if (show(label, result, describe)) passed += 1
  } catch (error) {
    console.log(`FAIL  ${label.padEnd(28)} -      -          ${String(error.message).slice(0, 80)}`)
  }
}

console.log('')
console.log(`${passed}/${checks.length} 通过`)
process.exitCode = passed === checks.length ? 0 : 1
