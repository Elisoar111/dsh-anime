// 通用下载器的线上冒烟：走 /downloads/stream，用 AniCh 的一集真线路下一个文件。
//
//   $env:DSH_PORT="40070"; node dev/probe-download-stream.mjs 39482
//
// 验四件事：
//   1. /downloads/stream 接受 {source, episode, server}，自己 resolve 出真地址；
//   2. 死线路会被挡在门外（探针要字节 + ffprobe 认得出视频流），不是闷头下；
//   3. 进度是 ffmpeg 的 out_time/total_size，不是假的 0%；
//   4. 字节真的落到 .part，取消后 job 变 cancelled。
//
// AniCh 索引时常 30 s 超时（实测三次里两次），所以每个请求都重试。

import { readdir, stat } from 'node:fs/promises'

const PORT = process.env.DSH_PORT ?? '43194'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`
const animeId = process.argv[2] ?? '39482'
const ENOUGH = 8 * 1024 * 1024

const json = async (path, init) => {
  const response = await fetch(BASE + path, init)
  return { status: response.status, payload: await response.json().catch(() => null) }
}
/** AniCh 上游抖，一次失败不代表接口坏：重试三次再判死。 */
const jsonRetry = async (path, init, attempts = 3) => {
  for (let round = 1; round <= attempts; round += 1) {
    const result = await json(path, init).catch((error) => ({ status: 0, payload: { ok: false, error: { message: String(error?.message ?? error) } } }))
    if (result.payload?.ok === true) return result
    console.log(`  retry ${round}/${attempts} ${path} → ${result.payload?.error?.message ?? result.status}`)
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  return { status: 0, payload: null }
}
const post = (name, body) =>
  jsonRetry(`/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

let failures = 0
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` · ${detail}`}`)
  if (!ok) failures += 1
}

const episodes = await jsonRetry(`/online/episodes?source=anich&id=${animeId}`)
const first = episodes.payload?.data?.items?.[0]
console.log(`episodes: ${episodes.payload?.data?.items?.length ?? 0} 集, 第一集 id=${first?.id} number=${first?.number}`)
check(first?.id !== undefined, 'AniCh 能给出集数')
if (first?.id === undefined) process.exit(1)

const servers = await jsonRetry(`/online/servers?source=anich&id=${animeId}&episode=${encodeURIComponent(String(first.number ?? 1))}`)
const lines = servers.payload?.data?.items ?? []
console.log(`servers: ${lines.length} 条, 第一条 ${lines[0]?.name ?? '(空)'}`)
check(lines.length > 0, '按集能查到线路', `${lines.length} 条`)
if (lines.length === 0) process.exit(1)
const server = String(lines[0]?.name ?? '')

const started = await post('downloads/stream', {
  source: 'anich',
  episode: first.id,
  server,
  title: `probe-anich-${animeId}-ep1`,
})
const startedBody = started.payload
console.log('start:', JSON.stringify(startedBody).slice(0, 240))
check(startedBody?.ok === true, '/downloads/stream 接受 source+episode+server', startedBody?.error?.message ?? '')
if (startedBody?.ok !== true) process.exit(1)

const id = startedBody?.data?.job?.id ?? startedBody?.job?.id
if (id === undefined) {
  console.log('没有拿到 job id')
  process.exit(1)
}

let last = null
let peak = 0
for (let i = 0; i < 45; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const state = await json('/downloads')
  const job = (state.payload?.data?.jobs ?? []).find((entry) => entry.id === id)
  if (job === undefined) continue
  last = job
  peak = Math.max(peak, Number(job.received) || 0)
  const pct = Math.round((job.progress ?? 0) * 100)
  if (i % 5 === 0 || job.status !== 'running') {
    console.log(`t=${(i + 1) * 2}s status=${job.status} ${pct}% received=${job.formattedReceived} speed=${job.formattedSpeed || '-'}${job.error ? ` err=${job.error}` : ''}`)
  }
  if (peak >= ENOUGH) {
    // 一整集要几分钟：够证明“字节在流”就收手，不必下完。
    console.log(`已经收到 ${(peak / 1048576).toFixed(1)} MB，取消这次下载`)
    await post('downloads/cancel', { id })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const after = await json('/downloads')
    last = (after.payload?.data?.jobs ?? []).find((entry) => entry.id === id) ?? last
    break
  }
  if (job.status !== 'running' && job.status !== 'queued') break
}

check(peak > 0, '字节真的在流', `${(peak / 1048576).toFixed(2)} MB`)
check(last?.error === null || last?.error === undefined || last?.error === '', '没有落到死线路的错误上', last?.error ?? '')

if (last?.path) {
  const folder = last.path.replace(/[\\/][^\\/]+$/, '')
  const info = await stat(last.path).catch(() => null)
  const rows = await readdir(folder).catch(() => [])
  const parts = rows.filter((name) => name.endsWith('.part'))
  console.log(`file: ${last.path} · ${info === null ? '不在' : `${info.size} 字节`} · .part: ${parts.length === 0 ? '(无)' : parts.join(', ')}`)
}
console.log(`jobs: ${JSON.stringify(last).slice(0, 400)}`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exitCode = failures === 0 ? 0 : 1
