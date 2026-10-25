/**
 * Proves the Bangumi source is correct while the site itself is unreachable.
 *
 * `api.bgm.tv` cannot be reached from this machine at all: DNS hands back
 * sinkhole addresses (108.160.161.20, 157.240.3.50) and a TLS handshake to a
 * known-good Cloudflare address for that SNI is reset within 200 ms. So instead
 * of waiting for a proxy, point `bangumi.apiBase` at a local stand-in and ask
 * the running host to serve 搜索 / 季度 / 详情 / 日历. Every assertion below is a
 * real HTTP response from the host, not a unit test of a mapper.
 *
 *   node dev/probe-bangumi-mirror.mjs            # uses DSH_PORT or 40070
 *
 * It restores `apiBase` to '' when it finishes, so a proxy the user typed in
 * is not silently replaced.
 */
const PORT = process.env.DSH_PORT || '40070'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`

const { startMockBangumi } = await import('./mock-bgm.mjs')

async function call(path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-json bodies are reported verbatim below */
  }
  return { status: response.status, json, text }
}

function fail(message) {
  console.log(`FAIL ${message}`)
  process.exitCode = 1
}

const mock = await startMockBangumi()
console.log(`桩上游 ${mock.url}`)

const before = await call('/extensions')
const bangumiBefore = (before.json?.data?.items ?? before.json?.items ?? []).find(
  (item) => item?.id === 'bangumi',
)
const originalBase = bangumiBefore?.values?.apiBase ?? ''
console.log(`原 apiBase = ${originalBase === '' ? '(默认 https://api.bgm.tv)' : originalBase}`)

try {
  const saved = await call('/extensions/save', {
    method: 'POST',
    body: JSON.stringify({ id: 'bangumi', values: { apiBase: mock.url } }),
  })
  if (saved.status !== 200) fail(`extensions/save → ${saved.status} ${saved.text.slice(0, 120)}`)

  const health = await call('/health')
  const endpoint = health.json?.data?.sources?.bangumi?.endpoint
  console.log(`health.sources.bangumi.endpoint = ${endpoint}`)
  if (endpoint !== mock.url) fail(`健康接口没跟上 apiBase（${endpoint}）`)

  const search = await call('/bangumi/search?q=air')
  const hits = search.json?.data?.items ?? []
  console.log(
    `搜索 "air" → ${search.status} ok=${search.json?.ok} items=${hits.length}` +
      (hits[0] ? ` 首条=${hits[0].id} ${hits[0].title} score=${hits[0].score}` : ''),
  )
  if (hits.length !== 1) fail(`搜索应命中 1 条 AIR，实际 ${hits.length}`)
  if (hits[0] && hits[0].bgmId !== 2) fail(`搜索首条 bgmId 应为 2，实际 ${hits[0]?.bgmId}`)

  const season = await call('/bangumi/season?season=FALL&year=2026')
  const seasonItems = season.json?.data?.items ?? []
  console.log(
    `季度 2026 FALL → ${season.status} ok=${season.json?.ok} items=${seasonItems.length}` +
      (seasonItems.length > 0 ? ` (${seasonItems.map((item) => item.bgmId).join(',')})` : ''),
  )
  if (seasonItems.length !== 2) fail(`2026 秋应有 2 条（10-23 / 11-01），实际 ${seasonItems.length}`)
  const untitled = seasonItems.find((item) => item.bgmId === 40001)
  if (untitled && untitled.title !== 'Desert Test') {
    fail(`没有中文标题时应回退到原名，实际「${untitled.title}」`)
  }

  const subject = await call('/bangumi/subject?id=39802')
  const detail = subject.json?.data
  console.log(
    `详情 39802 → ${subject.status} ok=${subject.json?.ok} eps=${detail?.eps} score=${detail?.score} name_cn=${detail?.nameCn}`,
  )
  if (detail?.eps !== 1) fail(`详情集数应为 1，实际 ${detail?.eps}`)

  const episodes = await call('/bangumi/episodes?id=2')
  const episodeList = episodes.json?.data?.items ?? []
  console.log(
    `集数 2 → ${episodes.status} ok=${episodes.json?.ok} 条数=${episodeList.length}` +
      (episodeList[0] ? ` 首集=${episodeList[0].sort} ${episodeList[0].nameCn}` : ''),
  )
  if (episodeList.length !== 2) fail(`AIR 应有 2 集，实际 ${episodeList.length}`)

  const calendar = await call('/bangumi/calendar')
  const days = calendar.json?.data?.days ?? []
  const total = days.reduce((sum, day) => sum + (day.items?.length ?? 0), 0)
  console.log(`日历 → ${calendar.status} ok=${calendar.json?.ok} 天=${days.length} 条目=${total}`)
  if (days.length !== 7) fail(`日历应有 7 天，实际 ${days.length}`)

  console.log(`桩上游收到的请求：${mock.hits.length} 次`)
  const unexpected = mock.hits.filter(
    (hit) => !/^GET \/(calendar|v0\/subjects\/\d+|v0\/episodes)$|^POST \/v0\/search\/subjects$/.test(hit),
  )
  if (unexpected.length > 0) console.log(`额外的请求：${unexpected.join(', ')}`)
} finally {
  const restored = await call('/extensions/save', {
    method: 'POST',
    body: JSON.stringify({ id: 'bangumi', values: { apiBase: originalBase } }),
  })
  console.log(
    `还原 apiBase ${restored.status === 200 ? '成功' : `失败 ${restored.status}`} → ` +
      `${originalBase === '' ? '(默认)' : originalBase}`,
  )
  await mock.close()
}

console.log(process.exitCode === 1 ? '\n有断言失败，见上面 FAIL 行。' : '\n全部通过。')
