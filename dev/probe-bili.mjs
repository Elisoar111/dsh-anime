// Probe: is bilibili bangumi playable from this machine?
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/', Origin: 'https://www.bilibili.com' }

async function j(url, headers = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { ...H, ...headers }, signal: AbortSignal.timeout(20000) })
    const text = await r.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = text.slice(0, 200) }
    return { status: r.status, ms: Date.now() - t0, body }
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, error: String(e && e.message || e) }
  }
}

const out = {}

// 1. search a bangumi by keyword
const s = await j('https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi&keyword=' + encodeURIComponent('芙莉莲'))
const items = s.body?.data?.result || []
out.search = { status: s.status, ms: s.ms, code: s.body?.code, count: items.length }
out.searchFirst = items.slice(0, 3).map((x) => ({ title: String(x.title || '').replace(/<[^>]+>/g, ''), season_id: x.season_id, media_id: x.media_id, eps: x.ep_size, score: x.media_score?.score }))

const sid = items[0]?.season_id
if (!sid) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

// 2. season detail
const d = await j(`https://api.bilibili.com/x/pgc/view/web/season?season_id=${sid}`)
const res = d.body?.result || {}
out.season = { status: d.status, ms: d.ms, code: d.body?.code, title: res.season_title, episodes: (res.episodes || []).length, total: res.total, newEp: res.new_ep?.desc }
out.ep0 = res.episodes?.[0] && {
  ep_id: res.episodes[0].ep_id, bvid: res.episodes[0].bvid, cid: res.episodes[0].cid,
  long_title: res.episodes[0].long_title, badge: res.episodes[0].badge, duration: res.episodes[0].duration,
}
out.section = (res.section || []).map((x) => ({ title: x.title, n: (x.episodes || []).length }))

// 3. playurl (dash, no login)
const ep = res.episodes?.[0]
if (ep) {
  const p = await j(`https://api.bilibili.com/x/player/playurl?ep_id=${ep.ep_id}&cid=${ep.cid}&qn=64&fnval=4048&fourk=1`)
  const pr = p.body?.result || {}
  out.playurl = { status: p.status, ms: p.ms, code: p.body?.code, message: p.body?.message, quality: pr.quality, accept: pr.accept_description?.slice(0, 5) }
  const dash = pr.dash
  out.dash = dash ? {
    duration: dash.duration,
    video: (dash.video || []).slice(0, 3).map((v) => ({ id: v.id, codecs: v.codecs, w: v.width, h: v.height, host: safeHost(v.baseUrl), hasBackup: (v.backupUrl || []).length })),
    audio: (dash.audio || []).slice(0, 2).map((a) => ({ id: a.id, host: safeHost(a.baseUrl) })),
  } : null
  out.durl = pr.durl ? pr.durl.map((x) => ({ host: safeHost(x.url), size: x.size, length: x.length })) : null

  // 4. can we actually fetch bytes of the first video url?
  const vu = (dash?.video?.[0]?.baseUrl) || pr.durl?.[0]?.url
  if (vu) {
    const t0 = Date.now()
    try {
      const r = await fetch(vu, { headers: { ...H, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(20000) })
      const b = Buffer.from(await r.arrayBuffer())
      out.videoFetch = { status: r.status, ms: Date.now() - t0, bytes: b.length, type: r.headers.get('content-type'), head: b.subarray(0, 12).toString('hex') }
    } catch (e) { out.videoFetch = { error: String(e.message || e), ms: Date.now() - t0 } }
  }
}

function safeHost(u) { try { return new URL(u).host } catch { return String(u).slice(0, 40) } }
console.log(JSON.stringify(out, null, 2))
