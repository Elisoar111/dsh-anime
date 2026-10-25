// What bilibili exposes as view points / chapters for one video.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const REFERER = 'https://www.bilibili.com'

const get = async (url) => {
  const response = await fetch(url, { headers: { referer: REFERER, 'user-agent': UA, accept: 'application/json' } })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 200) }
  }
}

const view = await get('https://api.bilibili.com/x/web-interface/view?bvid=BV1C8nH69EpL')
console.log('view code', view.code, view.message)
console.log('view_points:', JSON.stringify(view.data?.view_points ?? null))
console.log('pages:', (view.data?.pages ?? []).length, JSON.stringify((view.data?.pages ?? []).slice(0, 2).map((p) => ({ cid: p.cid, page: p.page, part: p.part, duration: p.duration }))))

const nav = await get('https://api.bilibili.com/x/player/videoshot?bvid=BV1C8nH69EpL&cid=42965076857&index=1')
console.log('videoshot code', nav.code, 'images', (nav.data?.image ?? []).length)
