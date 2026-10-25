// Probe 5: correct PGC endpoints — season, playurl, byte fetch.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BASE = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Origin: 'https://www.bilibili.com', Accept: 'application/json, text/plain, */*' }
async function j(url, headers = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { ...BASE, ...headers }, signal: AbortSignal.timeout(25000) })
    const t = await r.text()
    let b = null; try { b = JSON.parse(t) } catch { b = t.slice(0, 160) }
    return { status: r.status, ms: Date.now() - t0, body: b }
  } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e) } }
}
const host = (u) => { try { return new URL(u).host } catch { return String(u).slice(0, 40) } }
const out = {}
const spi = await j('https://api.bilibili.com/x/frontend/finger/spi')
const COOKIE = `buvid3=${spi.body?.data?.b_3}; buvid4=${spi.body?.data?.b_4}`

const SID = 46089
const d = await j(`https://api.bilibili.com/pgc/view/web/season?season_id=${SID}`, { Cookie: COOKIE })
const r = d.body?.result || {}
out.season = { status: d.status, code: d.body?.code, title: r.season_title, eps: (r.episodes || []).length, total: r.total,
  rating: r.rating && r.rating.score, rights: r.rights && { area_limit: r.rights.area_limit, is_preview: r.rights.is_preview } }
const ep = (r.episodes || [])[0]
out.ep1 = ep && { ep_id: ep.id, aid: ep.aid, bvid: ep.bvid, cid: ep.cid, long_title: ep.long_title, badge: ep.badge, duration: ep.duration }

const variants = [
  ['pgc-dash', `https://api.bilibili.com/pgc/player/web/playurl?ep_id=${ep?.id}&cid=${ep?.cid}&qn=64&fnval=4048&fourk=1`],
  ['pgc-mp4', `https://api.bilibili.com/pgc/player/web/playurl?ep_id=${ep?.id}&cid=${ep?.cid}&qn=32&fnval=1`],
  ['x-html5', `https://api.bilibili.com/x/player/playurl?ep_id=${ep?.id}&cid=${ep?.cid}&qn=32&fnval=1&platform=html5&high_quality=1`],
]
for (const [label, url] of variants) {
  const p = await j(url, { Cookie: COOKIE })
  const pr = p.body?.result || {}
  const rec = { status: p.status, code: p.body?.code, message: p.body?.message, quality: pr.quality, ms: p.ms }
  if (pr.dash?.video?.length) {
    rec.dashVideo = pr.dash.video.slice(0, 4).map((v) => ({ id: v.id, h: v.height, codecs: v.codecs, host: host(v.baseUrl), backups: (v.backupUrl || []).length }))
    rec.dashAudio = (pr.dash.audio || []).slice(0, 2).map((a) => ({ id: a.id, host: host(a.baseUrl) }))
  }
  if (pr.durl?.length) rec.durl = pr.durl.map((x) => ({ host: host(x.url), size: x.size, backups: (x.backup_url || []).length }))
  out[label] = rec
  const vu = pr.dash?.video?.[0]?.baseUrl || pr.durl?.[0]?.url
  if (vu && !out.videoFetch) {
    const t0 = Date.now()
    try {
      const rr = await fetch(vu, { headers: { ...BASE, Cookie: COOKIE, Range: 'bytes=0-2047' }, signal: AbortSignal.timeout(25000) })
      const buf = Buffer.from(await rr.arrayBuffer())
      out.videoFetch = { from: label, status: rr.status, ms: Date.now() - t0, bytes: buf.length, ct: rr.headers.get('content-type'), hex: buf.subarray(0, 16).toString('hex') }
    } catch (e) { out.videoFetch = { from: label, error: String(e.message || e), ms: Date.now() - t0 } }
  }
}
console.log(JSON.stringify(out, null, 2))
