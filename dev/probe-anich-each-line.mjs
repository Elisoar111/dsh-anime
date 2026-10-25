// 逐条线路试播：每条只看首字节/错误，用来分辨「真线路」和「站点塞的广告」。
//
//   $env:DSH_PORT="40070"; node dev/probe-anich-每个线路.mjs 39482

const PORT = process.env.DSH_PORT ?? '43194'
const BASE = `http://127.0.0.1:${PORT}/dsh-anime/api`
const animeId = process.argv[2] ?? '39482'

const json = async (path) => {
  const response = await fetch(BASE + path)
  return { status: response.status, payload: await response.json() }
}

const episodes = await json(`/online/episodes?source=anich&id=${animeId}`)
const first = episodes.payload?.data?.items?.[0]
const episode = first?.id ?? `${animeId}|1`
const servers = await json(`/online/servers?source=anich&id=${animeId}`)
const lines = servers.payload?.data?.items ?? []
console.log(`episode=${episode} lines=${lines.length}`)

for (const item of lines) {
  const query = `source=anich&episode=${encodeURIComponent(episode)}&server=${encodeURIComponent(item.name)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  const started = Date.now()
  try {
    const response = await fetch(`${BASE}/online/stream?${query}`, { signal: controller.signal })
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('application/json')) {
      const body = await response.json()
      console.log(`  ${item.name} [${item.type}] -> 错误 ${String(body?.error?.message ?? '').slice(0, 110)}`)
      continue
    }
    const reader = response.body?.getReader()
    let bytes = 0
    while (reader !== undefined && bytes < 262144) {
      const chunk = await reader.read()
      if (chunk.done === true) break
      bytes += chunk.value?.length ?? 0
    }
    await reader?.cancel?.().catch(() => undefined)
    console.log(`  ${item.name} [${item.type}] -> ${response.status} ${type} ${bytes} 字节 ${Date.now() - started}ms`)
  } catch (error) {
    console.log(`  ${item.name} [${item.type}] -> ERR ${error?.name} ${error?.message ?? ''}`)
  } finally {
    clearTimeout(timer)
  }
}
