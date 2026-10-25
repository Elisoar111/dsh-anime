// Live smoke test for the per-anime line list: for each anime it asks the host
// which lines carry it, takes the line with the most episodes, lists that line's
// episodes and resolves the first one. Everything goes through the real routes.
const PORT = Number(process.env.DSH_PORT ?? 43194)
const API = `http://127.0.0.1:${PORT}/dsh-anime/api`

const get = async (path) => {
  const response = await fetch(`${API}${path}`)
  const body = await response.json()
  return body?.data ?? body
}

const health = await get('/health')
console.log('build', health.build)

const browse = await get('/online/browse?source=fqdm&page=1')
const items = Array.isArray(browse.items) ? browse.items : []
console.log('browse', items.length)

for (const item of items.slice(0, 4)) {
  const lines = await get(`/online/servers?source=fqdm&id=${item.id}`)
  const list = Array.isArray(lines.items) ? lines.items : []
  const best = [...list].sort((left, right) => Number(right.count ?? 0) - Number(left.count ?? 0))[0] ?? null
  const eps = await get(
    `/online/episodes?source=fqdm&id=${item.id}&server=${encodeURIComponent(best?.name ?? '')}`,
  )
  const episodes = Array.isArray(eps.items) ? eps.items : []
  const first = episodes[0] ?? null
  let played = 'n/a'
  if (first !== null) {
    const head = await fetch(
      `${API}/online/stream?source=fqdm&episode=${encodeURIComponent(first.id)}&server=${encodeURIComponent(best.name)}`,
    )
    played = `${head.status} ${head.headers.get('content-type') ?? ''}`
    await head.body?.cancel?.()
  }
  console.log(
    JSON.stringify({
      id: item.id,
      title: item.title,
      lines: list.map((entry) => `${entry.name}:${entry.sid}:${entry.count}`),
      picked: best?.name ?? '',
      episodes: episodes.length,
      first: first === null ? null : `${first.id} ${first.title}`,
      play: played,
    }),
  )
}
