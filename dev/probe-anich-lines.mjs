// 线路表 / 时长 / 可拖拽性 三件套的线上冒烟。
//
//   $env:DSH_PORT="40070"; node dev/probe-anich-lines.mjs 39482
//
// 验的是三件事：
//   1. /online/servers 回的是这一集真实的线路（带 caption），不是假的「线路1…线路8」；
//   2. /online/duration 能给出真实总长（mp4 走 ffprobe 读 moov，m3u8 走 #EXTINF 求和）；
//   3. /online/stream 带 Range 请求时回 206 + content-range，也就是浏览器能自己拖。

const PORT = process.env.DSH_PORT ?? '43194'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`
const animeId = process.argv[2] ?? '39482'

const json = async (path) => {
  const response = await fetch(BASE + path)
  return { status: response.status, payload: await response.json() }
}

const line = (label, value) =>
  console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)

const servers = await json(`/online/servers?source=anich&id=${animeId}`)
let list = servers.payload?.data?.items ?? []
if (list.length === 0) {
  // A reload leaves a short window where the route is unowned; one retry keeps
  // that from looking like "the source has no lines".
  console.log(`  （第一次空了：${JSON.stringify(servers.payload).slice(0, 120)}，重试）`)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const again = await json(`/online/servers?source=anich&id=${animeId}`)
  list = again.payload?.data?.items ?? []
}
line('servers(ep1)', `${list.length} 条`)
for (const item of list.slice(0, 4)) line('  ·', `${item.name} [${item.type}]`)
const fixed = list.every((item) => /^线路\d+$/.test(String(item.name ?? '')))
if (list.length > 0 && fixed) console.error('!! 还是假的固定线路名')
if (list.length !== 15) console.log(`  （这一集 ${list.length} 条，之前实测 15 条，数量随集数变是正常的）`)

const episodes = await json(`/online/episodes?source=anich&id=${animeId}`)
const first = episodes.payload?.data?.items?.[0]
line('episodes', `${episodes.payload?.data?.items?.length ?? 0} 集, id=${first?.id}`)
if (first !== undefined && String(first.id).includes('|') === false) console.error('!! 集数 id 没有带番剧 id，resolve 会失败')

const picked = list[0]?.name ?? '线路1'
const query = `source=anich&episode=${encodeURIComponent(first?.id ?? `${animeId}|1`)}&server=${encodeURIComponent(picked)}`

const duration = await json(`/online/duration?${query}`)
line('duration', `${duration.payload?.data?.seconds ?? '?'} 秒`)

const plain = await fetch(`${BASE}/online/stream?${query}`)
line('stream', `${plain.status} ${plain.headers.get('content-type')} len=${plain.headers.get('content-length')} ranges=${plain.headers.get('accept-ranges')}`)
await plain.body?.cancel?.()

const ranged = await fetch(`${BASE}/online/stream?${query}`, { headers: { range: 'bytes=0-1048575' } })
const probe = Buffer.from(await ranged.arrayBuffer())
line(
  'range',
  `${ranged.status} ${ranged.headers.get('content-type')} ${probe.length} 字节 range=${ranged.headers.get('content-range')}`,
)
line('head', probe.subarray(0, 16).toString('hex'))
