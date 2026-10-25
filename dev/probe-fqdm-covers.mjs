/**
 * Which FQDM endpoint carries cover art?
 *
 * A MacCMS site usually exposes an XML/JSON feed with `vod_pic` in it, and the
 * detail page always has one. This asks all of the usual candidates for the
 * same title and prints what each one actually returned.
 *
 *   node dev/probe-fqdm-covers.mjs [term]
 */
const BASE = 'https://www.fqdm.cc'
const TERM = process.argv[2] ?? '咒术回战'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const HEADERS = { 'user-agent': UA, referer: `${BASE}/`, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }

const get = async (url) => {
  const started = Date.now()
  try {
    const response = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    const text = await response.text()
    return { status: response.status, ms: Date.now() - started, text }
  } catch (error) {
    return { status: 0, ms: Date.now() - started, text: '', error: String(error?.message ?? error) }
  }
}

const show = (label, result, extra = '') => {
  const head = result.text.slice(0, 260).replace(/\s+/g, ' ')
  console.log(`${label.padEnd(26)} ${String(result.status).padStart(3)} ${String(result.ms).padStart(5)}ms ${String(result.text.length).padStart(7)}B ${extra}`)
  if (result.error !== undefined) console.log(`   !! ${result.error}`)
  else console.log(`   ${head}`)
}

// 1. The MacCMS JSON feed — the one most apps use, and it normally has vod_pic.
show('api/vod ac=list', await get(`${BASE}/api.php/provide/vod/?ac=list&wd=${encodeURIComponent(TERM)}&pg=1`))
show('api/vod ac=detail', await get(`${BASE}/api.php/provide/vod/?ac=detail&wd=${encodeURIComponent(TERM)}`))
show('api/vod (no query)', await get(`${BASE}/api.php/provide/vod/?ac=list`))

// 2. The suggest endpoint the upstream provider already uses.
show('ajax/suggest', await get(`${BASE}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(TERM)}&limit=3`))

// 3. The search page — covers live in <img src> there.
const search = await get(`${BASE}/index.php/vod/search.html?wd=${encodeURIComponent(TERM)}`)
const pics = [...search.text.matchAll(/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/g)].map((m) => m[1])
console.log(`search page imgs           ${pics.length} ${JSON.stringify(pics.slice(0, 5))}`)
const detailIds = [...search.text.matchAll(/vod\/detail\/id\/(\d+)\.html/g)].map((m) => m[1])
console.log(`search page ids            ${JSON.stringify([...new Set(detailIds)].slice(0, 5))}`)

// 4. A detail page: og:image, vod_pic style picture block.
const id = [...new Set(detailIds)][0]
if (id !== undefined) {
  const detail = await get(`${BASE}/index.php/vod/detail/id/${id}.html`)
  const og = detail.text.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
  const pic = detail.text.match(/<img[^>]+class="[^"]*lazyload[^"]*"[^>]+data-original="([^"]+)"/i)
  const anyPic = [...detail.text.matchAll(/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/g)].map((m) => m[1])
  console.log(`detail ${id} og:image       ${og === null ? '(none)' : og[1]}`)
  console.log(`detail ${id} lazyload        ${pic === null ? '(none)' : pic[1]}`)
  console.log(`detail ${id} imgs            ${anyPic.length} ${JSON.stringify(anyPic.slice(0, 6))}`)
}
