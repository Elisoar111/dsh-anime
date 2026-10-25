// Probe 2: bilibili with buvid3 cookie, timeline-based season discovery, playurl.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const BASE = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Origin: 'https://www.bilibili.com', Accept: 'application/json, text/plain, */*' }

async function j(url, headers = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { ...BASE, ...headers }, signal: AbortSignal.timeout(20000) })
    const text = await r.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = text.slice(0, 160) }
    return { status: r.status, ms: Date.now() - t0, body, setCookies: r.headers.getSetCookie?.() || [] }
  } catch (e) { return { status: 0, ms: Date.now() - t0, error: String(e.message || e) } }
}
const host = (u) => { try { return new URL(u).host } catch { return String(u).slice(0, 40) } }
const out = {}

// 1. fingerprint cookie
const spi = await j('https://api.bilibili.com/x/frontend/finger/spi')
const b3 = spi.body?.data?.b_3 || ''
const b4 = spi.body?.data?.b_4 || ''
out.spi = { status: spi.status, code: spi.body?.code, hasB3: !!b3, b4len: b4.length, ms: spi.ms }
const COOKIE = `buvid3=${b3}; buvid4=${b4}`

// 2. search again with cookie
const s = await j('https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=' + encodeURIComponent('芙莉莲'), { Cookie: COOKIE })
const items = s.body?.data?.result || []
out.searchWithCookie = { status: s.status, code: s.body?.code, count: items.length, ms: s.ms }
out.searchFirst = items.slice(0, 3).map((x) => ({ title: String(x.title || '').replace(/<[^>]+>/g, ''), season_id: x.season_id, eps: x.ep_size }))

// 3. timeline (known to work without cookie) to find a season + episode
const tl = await j('https://api.bilibili.com/pgc/web/timeline?types=1&before=0&after=6', { Cookie: COOKIE })
const days = tl.body?.result || []
const eps = days.flatMap((d) => (d.episodes || []).map((e) => ({ ...e, day: d.date })))
out.timeline = { status: tl.status, days: days.length, episodes: eps.length, ms: tl.ms }

// prefer a published episode
const pick = eps.find((e) => e.published) || eps[0]
out.pick = pick && { season_id: pick.season_id, episode_id: pick.episode_id, title: pick.title, pub_index: pick.pub_index, published: pick.published, day: pick.day }

if (pick?.season_id) {
  const d = await j(`https://api.bilibili.com/x/pgc/view/web/season?season_id=${pick.season_id}`, { Cookie: COOKIE })
  const r = d.body?.result || {}
  out.season = { status: d.status, code: d.body?.code, message: d.body?.message, title: r.season_title, eps: (r.episodes || []).length, total: r.total, rights: r.rights && { allowDm: r.rights.allow_dm, isPreview: r.rights.is_preview, areaLimit: r.rights.area_limit }, newEp: r.new_ep?.desc }
  const ep = (r.episodes || []).find((x) => x.id === pick.episode_id) || (r.episodes || [])[0]
  out.ep0 = ep && { id: ep.id, ep_id: ep.id, bvid: ep.bvid, cid: ep.cid, long_title: ep.long_title, badge: ep.badge, duration: ep.duration, url: ep.link }

  if (ep) {
    const p = await j(`https://api.bilibili.com/pgc/player/web/playurl?ep_id=${ep.id}&cid=${ep.cid}&qn=64&fnval=4048&fourk=1`, { Cookie: COOKIE })
    const pr = p.body?.result || {}
    out.playurl = { status: p.status, code: p.body?.code, message: p.body?.message, quality: pr.quality, ms: p.ms, accept: (pr.accept_description || []).slice(0, 4) }
    out.dashVideo = (pr.dash?.video || []).slice(0, 3).map((v) => ({ id: v.id, h: v.height, codecs: v.codecs, host: host(v.baseUrl) }))
    out.dashAudio = (pr.dash?.audio || []).slice(0, 2).map((a) => ({ id: a.id, host: host(a.baseUrl) }))
    out.durl = (pr.durl || []).map((x) => ({ host: host(x.url), size: x.size }))
    const vu = pr.dash?.video?.[0]?.baseUrl || pr.durl?.[0]?.url
    if (vu) {
      const t0 = Date.now()
      try {
        const rr = await fetch(vu, { headers: { ...BASE, Cookie: COOKIE, Range: 'bytes=0-2047' }, signal: AbortSignal.timeout(25000) })
        const buf = Buffer.from(await rr.arrayBuffer())
        out.videoFetch = { status: rr.status, ms: Date.now() - t0, bytes: buf.length, ct: rr.headers.get('content-type'), hex: buf.subarray(0, 16).toString('hex') }
      } catch (e) { out.videoFetch = { error: String(e.message || e), ms: Date.now() - t0 } }
    }
  }
}
console.log(JSON.stringify(out, null, 2))
