/**
 * Offline check of the mapping used by the `bili/chapters` route: it asks the
 * same endpoints with the same headers and prints the chapters the route would
 * return.
 *
 *   node dev/probe-chapters-route.mjs
 */
const API = 'https://api.bilibili.com'
const REFERER = 'https://www.bilibili.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const clampInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const readJson = async (path) => {
  const response = await fetch(`${API}${path}`, { headers: { referer: REFERER, 'user-agent': UA } })
  return { status: response.status, body: await response.json() }
}

async function pgcChapters(epId) {
  const { body } = await readJson(`/pgc/view/web/season?ep_id=${epId}`)
  const episodes = Array.isArray(body?.result?.episodes) ? body.result.episodes : []
  const episode = episodes.find((item) => Number(item?.ep_id) === epId) ?? null
  const skip = episode?.skip ?? null
  const chapters = []
  const addWindow = (title, window) => {
    const start = clampInt(window?.start, 0, 0, 24 * 3600)
    const end = clampInt(window?.end, 0, 0, 24 * 3600)
    if (end > start) chapters.push({ start, end, title, skip: true })
  }
  addWindow('片头', skip?.op)
  addWindow('片尾', skip?.ed)
  chapters.sort((left, right) => left.start - right.start)
  return { code: body?.code, seasons: body?.result?.episodes?.length ?? 0, chapters }
}

async function uploadChapters(bvid, cidParam = 0) {
  let cid = cidParam
  if (cid <= 0) {
    const view = await readJson(`/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`)
    cid = clampInt(view.body?.data?.pages?.[0]?.cid, 0, 0, Number.MAX_SAFE_INTEGER)
  }
  const player = await readJson(`/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`)
  const points = Array.isArray(player.body?.data?.view_points) ? player.body.data.view_points : []
  const chapters = []
  for (const point of points) {
    const start = clampInt(point?.from, 0, 0, 24 * 3600)
    const end = clampInt(point?.to, 0, 0, 24 * 3600)
    if (end > start) chapters.push({ start, end, title: String(point?.content ?? ''), skip: false })
  }
  return { cid, code: player.body?.code, chapters }
}

const main = async () => {
  console.log('PGC ep=459343 ->', JSON.stringify(await pgcChapters(459343)))
  console.log('PGC ep=806233 ->', JSON.stringify(await pgcChapters(806233)))
  console.log('UGC BV1xrnz6gEVD ->', JSON.stringify(await uploadChapters('BV1xrnz6gEVD')))
  console.log('UGC with explicit cid ->', JSON.stringify(await uploadChapters('BV1xrnz6gEVD', 42926145926)))
}

main().catch((error) => {
  console.error('probe failed:', error?.message ?? error)
  process.exitCode = 1
})
