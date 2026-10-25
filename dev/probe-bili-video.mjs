const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const API = 'https://api.bilibili.com'

async function get(path, params = {}, extraHeaders = {}) {
  const url = new URL(`${API}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const started = Date.now()
  const response = await fetch(url, {
    headers: {
      'user-agent': UA,
      referer: 'https://www.bilibili.com/',
      origin: 'https://www.bilibili.com',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { raw: text.slice(0, 200) }
  }
  return { status: response.status, ms: Date.now() - started, payload }
}

// Fingerprint cookie first, the search endpoints answer 412 without it.
const spi = await get('/x/frontend/finger/spi')
const cookie = `buvid3=${spi.payload?.data?.b_3 ?? ''}; buvid4=${spi.payload?.data?.b_4 ?? ''}`
console.log('spi', spi.status, Object.keys(spi.payload?.data ?? {}))

const keyword = '孤独摇滚'
for (const path of ['/x/web-interface/search/type', '/x/web-interface/wbi/search/type']) {
  const search = await get(path, { search_type: 'video', keyword, page: 1 }, { cookie })
  console.log(
    path,
    search.status,
    'code=',
    search.payload?.code,
    'msg=',
    search.payload?.message,
    'videos=',
    search.payload?.data?.result?.length ?? '-',
  )
  const first = search.payload?.data?.result?.[0]
  if (first) console.log('  first:', first.bvid, first.title?.slice(0, 40), '|', first.author, '|', first.duration, '|', first.play)
  if (search.payload?.data?.numResults !== undefined) console.log('  numResults:', search.payload.data.numResults)
}

const view = await get('/x/web-interface/view', { bvid: 'BV1GJ411x7h7' }, { cookie })
console.log('view', view.status, 'code=', view.payload?.code, 'title=', view.payload?.data?.title?.slice(0, 40))
console.log('  pages:', view.payload?.data?.pages?.slice(0, 3).map((p) => `${p.page}:${p.cid}:${p.part}`))
console.log('  owner:', view.payload?.data?.owner?.name, 'duration:', view.payload?.data?.duration)

const cid = view.payload?.data?.pages?.[0]?.cid ?? view.payload?.data?.cid
for (const params of [
  { bvid: 'BV1GJ411x7h7', cid, qn: 64, fnval: 1, fnver: 0, fourk: 1 },
  { bvid: 'BV1GJ411x7h7', cid, qn: 80, fnval: 1, fourk: 1, platform: 'html5' },
  { bvid: 'BV1GJ411x7h7', cid, qn: 16, fnval: 1 },
]) {
  const play = await get('/x/player/playurl', params, { cookie })
  const durl = play.payload?.data?.durl?.[0]
  console.log(
    'playurl qn=' + params.qn,
    play.status,
    'code=',
    play.payload?.code,
    'quality=',
    play.payload?.data?.quality,
    'accept=',
    play.payload?.data?.accept_quality,
    'size=',
    durl?.size,
    'url?',
    Boolean(durl?.url),
  )
  if (durl?.url) {
    const head = await fetch(durl.url, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/', range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(20000),
    })
    const buffer = Buffer.from(await head.arrayBuffer())
    console.log('  media', head.status, buffer.length, buffer.subarray(0, 12).toString('hex'), head.headers.get('content-range'))
    break
  }
}
