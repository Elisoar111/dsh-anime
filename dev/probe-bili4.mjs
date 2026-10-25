const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Origin: 'https://www.bilibili.com' }
async function raw(url) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(20000) })
    const t = await r.text()
    return { url: url.replace('https://api.bilibili.com', ''), status: r.status, ms: Date.now() - t0, len: t.length, head: t.slice(0, 220) }
  } catch (e) { return { url, status: 0, error: String(e.message || e) } }
}
const urls = [
  'https://api.bilibili.com/pgc/view/web/season?season_id=46089',
  'https://api.bilibili.com/x/pgc/view/web/season?season_id=46089',
  'https://api.bilibili.com/pgc/view/web/season?season_id=33378',
  'https://api.bilibili.com/pgc/view/web/season?ep_id=6394497',
]
for (const u of urls) console.log(JSON.stringify(await raw(u)))
