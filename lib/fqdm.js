/**
 * FQDM (fqdm.cc) — a MacCMS site with Chinese-subbed anime and donghua.
 *
 * The upstream Seanime extension is a `provider.js` with `search`,
 * `findEpisodes` and `findEpisodeServer`; this is the same logic expressed as
 * our extension handlers, so the page can drive it through the generic online
 * routes without knowing anything about MacCMS.
 *
 * Shapes (the contract every `online` extension shares):
 *   search({ term })            → [{ id, title, url, poster, sub }]
 *   episodes({ id })            → [{ id, number, title }]
 *   servers()                   → string[]
 *   resolve({ episodeId, server }) → { server, url, type, headers }
 */

import { parseHtml } from './html.js'

const BASE = 'https://www.fqdm.cc'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
/** The mirror list the site itself offers; the first one that answers wins. */
const MIRRORS = [BASE, 'https://www.fqdm.co']

/** Servers the site publishes, in its own order (the switcher shows these). */
const SERVERS = ['新浪资源2', '番茄2线', '番茄1线', '速播资源1', '无尽②']

function headers(base) {
  return {
    referer: `${base}/`,
    'user-agent': UA,
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
}

async function getText(url, base) {
  const response = await fetch(url, { headers: headers(base), redirect: 'follow' })
  if (response.ok !== true) throw new Error(`FQDM 返回 HTTP ${response.status}`)
  return await response.text()
}

function decodeTitle(raw) {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Covers arrive as fully absolute URLs on a per-entry CDN, but a relative or
 * protocol-relative one would still be worth rescuing rather than dropping.
 */
function absoluteCover(raw) {
  const value = String(raw ?? '').trim()
  if (value === '') return ''
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${BASE}${value}`
  return ''
}

/**
 * Sites like this answer a search with a small JSON API; the HTML page is the
 * fallback when that API is turned off or blocked.
 */
async function searchFromApi(term) {
  for (const base of MIRRORS) {
    try {
      const url = `${base}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(term)}&limit=20`
      const text = await getText(url, base)
      let data = null
      try {
        data = JSON.parse(text)
      } catch {
        // A WAF page comes back as HTML with status 200; fall through to HTML.
        data = null
      }
      const list = Array.isArray(data?.list) ? data.list : []
      if (list.length === 0) continue
      return {
        base,
        items: list.map((row) => ({
          id: String(row.id ?? ''),
          title: decodeTitle(row.name),
          // The suggest feed already carries the cover (a different CDN per
          // entry), so search results can be shown with art for free.
          cover: absoluteCover(row.pic),
        })),
      }
    } catch {
      /* try the next mirror */
    }
  }
  return null
}

async function searchFromPage(term) {
  for (const base of MIRRORS) {
    try {
      const html = await getText(`${base}/index.php/vod/search.html?wd=${encodeURIComponent(term)}`, base)
      const doc = parseHtml(html)
      const found = []
      const seen = new Set()
      // One card per result: `.module-card-item` links its title to
      // /index.php/vod/detail/id/<id>.html and carries the artwork in an <img>.
      // (The poster anchor's own text is the episode note, e.g. "第24集", which
      // is why the title has to come from the title node.)
      for (const card of doc.select('.module-card-item')) {
        if (found.length >= 30) break
        const titleNode = card.selectOne('.module-card-item-title') ?? card.selectOne('h3')
        const link =
          titleNode?.selectOne('a[href*="/vod/detail/id/"]') ??
          card.selectOne('a[href*="/vod/detail/id/"]')
        const id = /\/vod\/detail\/id\/(\d+)\.html/.exec(link?.attr('href') ?? '')?.[1]
        if (id === undefined || seen.has(id)) continue
        const title = decodeTitle(titleNode?.text() ?? link?.text() ?? '')
        if (title === '') continue
        seen.add(id)
        found.push({ id, title, cover: cardCover(card) })
      }
      // Older themes render plain anchors without the card wrapper.
      if (found.length === 0) {
        for (const anchor of doc.select('a[href*="/index.php/vod/detail/id/"]')) {
          if (found.length >= 30) break
          const id = /\/vod\/detail\/id\/(\d+)\.html/.exec(anchor.attr('href') ?? '')?.[1]
          const title = decodeTitle(anchor.text())
          if (id === undefined || title === '' || seen.has(id)) continue
          if (title.includes('查看') || title.includes('详情')) continue
          seen.add(id)
          found.push({ id, title, cover: '' })
        }
      }
      if (found.length > 0) return { base, items: found }
    } catch {
      /* try the next mirror */
    }
  }
  return null
}

/** Lazy-loaded artwork: the real URL sits in data-original until JS swaps it. */
function cardCover(card) {
  const img = card.selectOne('img')
  if (img === null) return ''
  return absoluteCover(img.attr('data-original') ?? img.attr('data-src') ?? img.attr('src') ?? '')
}

function withBase(base, items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    url: `${base}/index.php/vod/detail/id/${item.id}.html`,
    sub: 'sub',
    cover: item.cover ?? '',
  }))
}

/**
 * The catalogue feed behind the site's own "最新更新" grid. It is the only
 * endpoint that hands out covers together with the metadata worth showing
 * (更新到第几集 / 年份 / 地区 / 类型), so it is what a browse page should read.
 *
 *   /index.php/ajax/data?mid=1&limit=<n>&page=<p>
 */
async function browse({ page = 1, limit = 24 } = {}) {
  const pg = Math.max(1, Number(page) || 1)
  const size = Math.min(60, Math.max(1, Number(limit) || 24))
  for (const base of MIRRORS) {
    try {
      const text = await getText(`${base}/index.php/ajax/data?mid=1&limit=${size}&page=${pg}`, base)
      let data = null
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
      const list = Array.isArray(data?.list) ? data.list : []
      if (list.length === 0) continue
      const items = list.map((row) => ({
        id: String(row.vod_id ?? ''),
        title: decodeTitle(row.vod_name),
        cover: absoluteCover(row.vod_pic),
        note: String(row.vod_remarks ?? ''),
        year: String(row.vod_year ?? ''),
        area: String(row.vod_area ?? ''),
        kind: decodeTitle(String(row.type?.type_name ?? row.vod_class ?? '')).split(',')[0],
        score: String(row.vod_score ?? ''),
      }))
      console.info(`[dsh-anime] fqdm browse page=${pg} -> ${items.length}`)
      return items
    } catch {
      /* try the next mirror */
    }
  }
  return []
}

async function search(term) {
  const query = String(term ?? '').trim()
  if (query === '') return []
  const result = (await searchFromApi(query)) ?? (await searchFromPage(query))
  if (result === null) return []
  console.info(`[dsh-anime] fqdm search q=${query} -> ${result.items.length}`)
  return withBase(result.base, result.items)
}

/**
 * The detail page lists play links per server (SID) and episode (NID). The
 * server with the most episodes is the one the page defaults to, so it leads.
 */
/**
 * A detail page lists every line this specific anime is available on: the tabs
 * (.module-tab-item.tab-item, data-dropdown-value = the line's name) sit in the
 * same order as the episode panes (.module-list.sort-list). The sid in the play
 * links is per-anime, so the mapping name -> sid only holds for the page we just
 * parsed — that is exactly why the line list cannot be a global constant.
 */
function detailTabs(html, animeId) {
  const doc = parseHtml(html)
  const names = doc
    .select('.module-tab-item.tab-item')
    .map((tab) => String(tab.attr('data-dropdown-value') ?? '').trim())
    .filter((name) => name !== '')
  const panes = doc.select('.module-list.sort-list')
  const playLink = new RegExp(`/play/id/${animeId}/sid/(\\d+)/nid/(\\d+)\\.html`)
  const tabs = []
  panes.forEach((pane, index) => {
    const byNumber = new Map()
    for (const anchor of pane.select('a[href*="/play/id/"]')) {
      const match = playLink.exec(anchor.attr('href') ?? '')
      if (match === null) continue
      const nid = Number(match[2])
      if (Number.isFinite(nid) === false) continue
      if (byNumber.has(nid) === false) byNumber.set(nid, String(anchor.text() ?? '').trim())
      if (tabs[index] === undefined) tabs[index] = { name: names[index] ?? `线路${index + 1}`, sid: match[1], episodes: [] }
    }
    if (tabs[index] === undefined) return
    tabs[index].sid = tabs[index].sid ?? ''
    tabs[index].episodes = [...byNumber.keys()]
      .sort((left, right) => left - right)
      .map((nid) => ({ nid, label: byNumber.get(nid) }))
    // The first play link of the pane decides the sid; every pane is one sid.
    const first = pane.select('a[href*="/play/id/"]')[0]
    const sidMatch = first === undefined ? null : playLink.exec(first.attr('href') ?? '')
    if (sidMatch !== null) tabs[index].sid = sidMatch[1]
  })
  return tabs.filter((tab) => tab !== undefined && tab.episodes.length > 0)
}

/** Loads one detail page and returns its line list (name + sid + episode count). */
async function servers(id) {
  const animeId = String(id ?? '').trim()
  if (animeId === '') return fqdmServers().map((name) => ({ name, sid: '', count: 0 }))
  if (/^\d+$/.test(animeId) === false) return []
  for (const base of MIRRORS) {
    try {
      const html = await getText(`${base}/index.php/vod/detail/id/${animeId}.html`, base)
      const tabs = detailTabs(html, animeId)
      if (tabs.length === 0) continue
      console.info(`[dsh-anime] fqdm servers id=${animeId} -> ${tabs.length} (${tabs.map((tab) => tab.name).join('/')})`)
      return tabs.map((tab) => ({ name: tab.name, sid: tab.sid, count: tab.episodes.length }))
    } catch {
      /* try the next mirror */
    }
  }
  return []
}

/**
 * Episodes of one line. Without a line name the first tab is used (the site's
 * own default). The returned id carries `anime|sid|nid` so playback never has
 * to guess which line an episode belongs to.
 */
async function episodes(id, source = '') {
  const animeId = String(id ?? '').trim()
  if (/^\d+$/.test(animeId) === false) return []
  const wanted = String(source ?? '').trim()
  for (const base of MIRRORS) {
    try {
      const html = await getText(`${base}/index.php/vod/detail/id/${animeId}.html`, base)
      const tabs = detailTabs(html, animeId)
      if (tabs.length === 0) continue
      const tab = tabs.find((entry) => entry.name === wanted) ?? tabs[0]
      console.info(
        `[dsh-anime] fqdm episodes id=${animeId} line=${tab.name} sid=${tab.sid} -> ${tab.episodes.length} (${tabs.length} lines)`,
      )
      return tab.episodes.map((entry) => ({
        id: `${animeId}|${tab.sid}|${entry.nid}`,
        number: entry.nid,
        title: entry.label === '' ? `第${entry.nid}集` : entry.label,
        server: tab.name,
      }))
    } catch {
      /* try the next mirror */
    }
  }
  return []
}

/** The play page carries the real URL in a `player_aaaa` JSON blob. */
function playerJson(html) {
  const at = html.indexOf('player_aaaa')
  if (at < 0) return null
  const start = html.indexOf('{', at)
  if (start < 0) return null
  let depth = 0
  for (let index = start; index < html.length; index += 1) {
    const ch = html[index]
    if (ch === '{') depth += 1
    if (ch === '}') depth -= 1
    if (depth === 0) {
      try {
        return JSON.parse(html.slice(start, index + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function cleanUrl(raw) {
  let url = String(raw ?? '')
  if (url.includes('%u')) {
    url = url.replace(/%u([a-fA-F0-9]{4})/g, (_whole, hex) => String.fromCharCode(parseInt(hex, 16)))
  }
  if (url.includes('%')) {
    try {
      url = decodeURIComponent(url)
    } catch {
      /* leave it as it came */
    }
  }
  return url
}

async function resolve(episodeId, server) {
  const parts = String(episodeId ?? '').split('|')
  const animeId = parts[0] ?? ''
  const sid = parts[1] ?? ''
  const nid = parts[2] ?? '1'
  if (/^\d+$/.test(animeId) === false || /^\d+$/.test(sid) === false) {
    throw new Error('剧集 id 不完整，重新选一次集数')
  }
  for (const base of MIRRORS) {
    try {
      const html = await getText(`${base}/index.php/vod/play/id/${animeId}/sid/${sid}/nid/${nid}.html`, base)
      const data = playerJson(html)
      const url = cleanUrl(data?.url ?? '')
      if (url !== '') {
        const type = /\.m3u8/i.test(url) ? 'm3u8' : 'mp4'
        console.info(`[dsh-anime] fqdm resolve ep=${episodeId} server=${server ?? '-'} -> ${type}`)
        return { server: server ?? SERVERS[0], url, type, headers: headers(base) }
      }
      const direct = html.match(/https?:[^"'\s]+\.m3u8[^"'\s]*/)
      if (direct !== null) {
        return { server: server ?? SERVERS[0], url: direct[0], type: 'm3u8', headers: headers(base) }
      }
    } catch {
      /* try the next mirror */
    }
  }
  throw new Error('FQDM 没有给出播放地址（这一集可能换源了，改一个线路试试）')
}

/**
 * Total length of an HLS stream in seconds, summed from its playlist.
 *
 * The transcode route emits a live-style fragmented MP4 without a duration, so
 * the page has no way to show a real total. The playlist already knows it:
 * either it lists the segments itself, or it is a master playlist that points
 * at the variant which does.
 */
async function duration(episodeId, server) {
  const play = await resolve(episodeId, server)
  if (play.type !== 'm3u8') return 0
  const readPlaylist = async (target) => {
    const response = await fetch(target, { headers: play.headers })
    if (response.ok !== true) throw new Error(`播放列表返回 HTTP ${response.status}`)
    return response.text()
  }
  let text = await readPlaylist(play.url)
  if (text.includes('#EXT-X-STREAM-INF')) {
    const variant = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && line.startsWith('#') === false)
    if (variant === undefined) return 0
    const next = new URL(variant, play.url).toString()
    text = await readPlaylist(next)
  }
  let seconds = 0
  let segments = 0
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXTINF:') === false) continue
    const value = Number.parseFloat(trimmed.slice('#EXTINF:'.length))
    if (Number.isFinite(value) && value > 0) {
      seconds += value
      segments += 1
    }
  }
  const total = Math.round(seconds)
  console.info(`[dsh-anime] fqdm duration ep=${episodeId} -> ${total}s (${segments} segments)`)
  return total
}

/**
 * The other lines this episode exists on, with the id rewritten for each.
 *
 * A MacCMS episode id is `anime|sid|nid`, and the sid is per-anime — so moving
 * to another line means rebuilding the id, not just changing a name. The host
 * calls this when the clicked line dies before its first byte (typically a CDN
 * host that no longer resolves), so playback continues on a sibling line
 * instead of ending on a black frame.
 */
async function alternates(episodeId, server) {
  const parts = String(episodeId ?? '').split('|')
  const animeId = String(parts[0] ?? '').trim()
  const nid = String(parts[2] ?? '1').trim()
  if (/^\d+$/.test(animeId) === false || /^\d+$/.test(nid) === false) return []
  const current = String(server ?? '').trim()
  const list = await servers(animeId)
  const entries = list
    .filter((line) => line.name !== current && line.sid !== '' && line.count > 0)
    .map((line) => ({ server: line.name, episodeId: `${animeId}|${line.sid}|${nid}` }))
  console.info(
    `[dsh-anime] fqdm alternates ep=${episodeId} line=${current} -> ${entries.length} (${entries
      .map((entry) => entry.server)
      .join('/')})`,
  )
  return entries
}

export const fqdmExtension = {
  provider: 'fqdm',
  // `servers(id)` is the per-anime line list; with no id it falls back to the
  // site-wide names (that is what the manifest's default line uses).
  servers,
  search,
  browse,
  episodes,
  resolve,
  duration,
  alternates,
}

/** The server names, for a manifest that wants to offer them as a choice. */
export function fqdmServers() {
  return [...SERVERS]
}

/**
 * Exported for `dev/test-fqdm.mjs` only: the HTML search path is unreachable
 * while the site's JSON API answers, so it needs to be called directly.
 */
export const fqdmInternals = { searchFromPage }
