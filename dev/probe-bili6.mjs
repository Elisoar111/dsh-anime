// Checks which title form actually matches on bilibili's bangumi search, so the
// online view can try the most likely one first instead of the romaji name.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const spi = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
  headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
}).then((r) => r.json())
const cookie = `buvid3=${spi.data.b_3}; buvid4=${spi.data.b_4}`

const queries = [
  'Kusuriya no Hitorigoto 3rd Season',
  '薬屋のひとりごと',
  '薬屋のひとりごと 第3期',
  '药屋少女的呢喃',
  '葬送的芙莉莲',
]

for (const keyword of queries) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=${encodeURIComponent(keyword)}`
  const started = Date.now()
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': UA,
        referer: 'https://www.bilibili.com/',
        cookie,
        origin: 'https://www.bilibili.com',
      },
    })
    const payload = await response.json()
    const items = payload?.data?.result ?? []
    console.log(
      `${String(response.status).padEnd(4)} ${String(Date.now() - started).padStart(5)}ms  ${payload.code === 0 ? 'ok' : `code=${payload.code}`}  hits=${items.length}  <- ${keyword}`,
    )
    for (const item of items.slice(0, 3)) {
      const title = String(item.title ?? '').replace(/<[^>]+>/g, '')
      console.log(`        ${item.season_id}  ${title}  (${item.total_count ?? '?'} eps)`)
    }
  } catch (error) {
    console.log(`FAIL  ${keyword}: ${error.message}`)
  }
}
