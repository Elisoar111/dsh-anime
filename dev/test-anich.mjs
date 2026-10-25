// AniCh 源的线上冒烟：/online/sources 里要出现 anich；搜索 → 集数 → 线路 → 首字节。
// 需要先在设置里填 AniCh 账号（账号密码存在宿主 accounts.json 里）。
//
//   $env:DSH_PORT="43194"; node dev/test-anich.mjs

const PORT = process.env.DSH_PORT ?? '43194'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`

async function json(path) {
  const started = Date.now()
  const response = await fetch(BASE + path)
  const payload = await response.json()
  return { status: response.status, payload, ms: Date.now() - started }
}

function line(label, value) {
  console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
}

const sources = await json('/online/sources')
const items = sources.payload?.data?.items ?? []
line('sources', items.map((item) => `${item.id}:${item.enabled}`).join(' '))
if (!items.some((item) => item.id === 'anich')) {
  console.error('!! anich 没注册上')
  process.exit(1)
}

const term = process.argv[2] ?? '柯南'
const search = await json(`/online/search?source=anich&q=${encodeURIComponent(term)}`)
const found = search.payload?.data?.items ?? search.payload?.data ?? []
line(`search "${term}"`, `${found.length} 条 ${search.ms}ms`)
if (found.length === 0) {
  console.error('!! 搜索无结果（可能是账号没填）')
  console.error(JSON.stringify(search.payload).slice(0, 300))
  process.exit(1)
}
const first = found[0]
line('first', { id: first.id, title: first.title, note: first.note })

const episodes = await json(`/online/episodes?source=anich&id=${encodeURIComponent(first.id)}`)
const list = episodes.payload?.data?.items ?? []
line('episodes', `${list.length} 集`)
if (list.length === 0) {
  console.error('!! 没有集数')
  process.exit(1)
}

const episode = list[0]
const query = `/online/stream?source=anich&episode=${encodeURIComponent(episode.id)}&server=${encodeURIComponent('线路1')}`
const controller = new AbortController()
// 一条死线路要 15 s 才判死，宿主会自己往后换线（最多三条），所以窗口给到 75 s：
// 这里量的是「最终能不能出画面」，不是「第一条线路多快」。
const timer = setTimeout(() => controller.abort(), 75000)
try {
  const response = await fetch(BASE + query, { signal: controller.signal })
  const reader = response.body?.getReader()
  let bytes = 0
  const head = []
  const started = Date.now()
  while (reader && Date.now() - started < 5000) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.length
    if (head.length === 0) head.push(...chunk.value.subarray(0, 24))
  }
  await reader?.cancel?.()
  line('play', `${response.status} ${response.headers.get('content-type')} bytes=${bytes} head=${Buffer.from(head).toString('hex')}`)
} catch (error) {
  line('play', `ERR ${error?.message ?? error}`)
} finally {
  clearTimeout(timer)
}
