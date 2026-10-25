/**
 * AniBT (https://anibt.net) torrent provider.
 *
 * AniBT is a Chinese-run anime torrent index with a public JSON API. Its magnets
 * carry `tracker.anibt.net` plus the usual public trackers, which is the reason
 * it is the primary torrent source here: the mainstream English indexes (Nyaa,
 * Anidex, TokyoTosho) are unreachable from this machine, while AnimeTosho and
 * AniBT both answer.
 *
 * API shape (verified against the live service):
 *   GET /api/bgm/search?q=<title>&limit=5
 *       -> { ok: true, data: [{ bgmId, name, nameCn, image, seasonYear, totalEpisodes }] }
 *   GET /api/anime/groups?bgmId=<id>
 *       -> { ok: true, data: { groups: [{ name, items: [item] }] } }
 *   item = { releaseId, title, size, seeders, leechers, downloads, magnet, link, publishedAt, resolution, episodeKey }
 * Errors use { ok: false, error: { code, message, requestId } }.
 */

const ANIBT_BASE = 'https://anibt.net'
const ANIBT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * A single AniBT search fans out to a subject search plus one release listing
 * per subject, and each call costs 1-4 s. Everything is therefore cached for a
 * few minutes: opening a second episode of the same show must be instant.
 */
function createCache(ttlMs) {
  const store = new Map()
  return {
    async get(key, produce) {
      const hit = store.get(key)
      const now = Date.now()
      if (hit !== undefined && now - hit.at < ttlMs) return hit.value
      const value = await produce()
      const empty = Array.isArray(value) && value.length === 0
      if (!empty) store.set(key, { at: now, value })
      return value
    },
  }
}

const subjectCache = createCache(5 * 60 * 1000)
const releaseCache = createCache(5 * 60 * 1000)

function formatSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let size = value
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

function hexFromMagnet(magnet) {
  const match = /btih:([a-fA-F0-9]{40})/i.exec(String(magnet ?? ''))
  return match === null ? '' : match[1].toLowerCase()
}

/** `1080p` / `2160p` / `720p`, from an explicit field or the release title. */
function detectResolution(item) {
  const explicit = String(item.resolution ?? '').toLowerCase()
  if (explicit !== '') {
    if (explicit.includes('2160') || explicit.includes('4k')) return '2160p'
    if (explicit.includes('1080')) return '1080p'
    if (explicit.includes('720')) return '720p'
    if (explicit.includes('480')) return '480p'
  }
  const title = String(item.title ?? '')
  if (/\b(2160p|4k|uhd)\b/i.test(title)) return '2160p'
  if (/\b1080p\b/i.test(title)) return '1080p'
  if (/\b720p\b/i.test(title)) return '720p'
  if (/\b480p\b/i.test(title)) return '480p'
  return ''
}

/**
 * Episode number and batch flag.
 *
 * AniBT publishes both seasonal and absolute numbering for the same show, so a
 * title like `葬送的芙莉莲 S02 | 01-10` must be read as a season pack covering
 * episodes 1-10, while ` - 29 ` is episode 29. `episodeKey` wins when present.
 */
function detectEpisode(item, title) {
  const text = String(title ?? '')
  const ranged = /(?:^|[\s|[(（【])(\d{1,4})\s*[-~～]\s*(\d{1,4})(?:[\s|)\]}）】]|$)/.exec(text)
  if (ranged !== null) {
    const from = Number(ranged[1])
    const to = Number(ranged[2])
    if (Number.isFinite(from) && Number.isFinite(to) && to > from && to - from <= 200) {
      return { episodeNumber: from, isBatch: true, range: [from, to] }
    }
  }

  const key = String(item.episodeKey ?? '')
  if (key !== '') {
    const keyMatch = /(\d{1,4})/.exec(key)
    if (keyMatch !== null) {
      const isPack = /\b(batch|complete|season pack)\b|合集|全集|S\d{1,2}\s*\|/i.test(text)
      return { episodeNumber: Number(keyMatch[1]), isBatch: isPack, range: null }
    }
  }

  const patterns = [
    /[Ss]\d{1,2}[Ee](\d{1,4})/,
    /第\s*(\d{1,4})\s*[话話集]/,
    /\b[Ee][Pp]?\.?\s*(\d{1,4})\b/,
    /\s-\s*(\d{1,4})(?:v\d)?(?:\s|\.|\[|\(|$)/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match !== null) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value > 0) return { episodeNumber: value, isBatch: false, range: null }
    }
  }

  const isBatch = /\b(batch|season\s*\d+|合集|全集|S\d{1,2}\s*\|)/i.test(text)
  return { episodeNumber: isBatch ? 0 : -1, isBatch, range: null }
}

function detectReleaseGroup(item, groupName, title) {
  const explicit = String(groupName ?? '').trim()
  if (explicit !== '') return explicit
  const bracketed = /^\s*\[([^\]]{1,40})\]/.exec(String(title ?? ''))
  return bracketed === null ? '' : bracketed[1].trim()
}

async function getJson(path, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${ANIBT_BASE}${path}`, {
      headers: { 'user-agent': ANIBT_UA, accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`AniBT 返回 HTTP ${response.status}`)
    const payload = await response.json()
    if (payload !== null && typeof payload === 'object' && payload.ok === false) {
      const message = payload.error?.message ?? payload.error?.code ?? 'unknown error'
      throw new Error(`AniBT: ${message}`)
    }
    return payload
  } finally {
    clearTimeout(timer)
  }
}

/** Bangumi-id search: the entry point for every other AniBT query. */
async function searchSubjects(query, limit = 5) {
  return subjectCache.get(`${limit}:${query}`, async () => {
    const payload = await getJson(`/api/bgm/search?q=${encodeURIComponent(query)}&limit=${limit}`, 15000)
    return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
  })
}

/** Every release AniBT knows about for one bangumi subject. */
async function fetchReleases(bgmId) {
  return releaseCache.get(String(bgmId), async () => {
    const payload = await getJson(`/api/anime/groups?bgmId=${encodeURIComponent(bgmId)}`, 15000)
    const groups = payload?.data?.groups ?? []
    const out = []
    for (const group of groups) {
      for (const item of group.items ?? []) {
        out.push({ ...item, groupName: group.name ?? '', groupSlug: group.slug ?? '' })
      }
    }
    return out
  })
}

function toTorrent(item) {
  const title = String(item.title ?? '').trim()
  if (title === '') return null
  const magnet = String(item.magnet ?? '')
  if (!/^magnet:\?/i.test(magnet)) return null
  const { episodeNumber, isBatch, range } = detectEpisode(item, title)
  return {
    provider: 'anibt',
    providerLabel: 'AniBT',
    title,
    size: Number(item.size ?? 0) || 0,
    formattedSize: formatSize(item.size),
    seeders: Number(item.seeders ?? -1),
    leechers: Number(item.leechers ?? -1),
    downloads: Number(item.downloads ?? 0) || 0,
    magnet,
    // AniBT magnets are hex already; base32 only shows up on AnimeTosho.
    infoHash: hexFromMagnet(magnet),
    resolution: detectResolution(item),
    isBatch,
    episodeNumber,
    episodeRange: range,
    releaseGroup: detectReleaseGroup(item, item.groupName, title),
    date: String(item.publishedAt ?? ''),
    link: String(item.link ?? ''),
    subject: { bgmId: item.bgmId ?? null, name: item.subjectName ?? '' },
  }
}

/**
 * Search releases.
 *
 * `bangumiTitles` lets the caller hand over the titles it already knows (from
 * AniList/Bangumi), which matters because AniBT indexes Japanese and Chinese
 * titles while the user may search in either.
 */
export async function searchAniBT({ query, bangumiTitles = [], episode = 0, resolution = '', batch = '', limit = 60 }) {
  const queries = []
  for (const candidate of [query, ...bangumiTitles]) {
    const text = String(candidate ?? '').trim()
    if (text !== '' && !queries.includes(text)) queries.push(text)
  }
  if (queries.length === 0) return { provider: 'anibt', scanned: 0, matched: 0, items: [], subjects: [] }

  const subjectLists = await Promise.all(
    queries.slice(0, 3).map((text) => searchSubjects(text, 5).catch(() => [])),
  )

  const subjects = []
  const seenSubjects = new Set()
  for (const list of subjectLists) {
    for (const subject of list) {
      const id = subject?.bgmId
      if (id === undefined || id === null || seenSubjects.has(id)) continue
      seenSubjects.add(id)
      subjects.push({
        bgmId: id,
        name: subject.name ?? '',
        nameCn: subject.nameCn ?? '',
        year: subject.seasonYear ?? null,
        season: subject.season ?? '',
        image: subject.image ?? '',
        episodes: subject.totalEpisodes ?? null,
        rating: subject.rating ?? null,
      })
    }
  }

  // Only the subjects that can actually hold a release are worth a round trip.
  const chosen = subjects.slice(0, 3)
  const releaseLists = await Promise.all(chosen.map((subject) => fetchReleases(subject.bgmId).catch(() => [])))
  const items = []
  let scanned = 0
  for (let index = 0; index < chosen.length; index += 1) {
    const subject = chosen[index]
    const releases = releaseLists[index]
    scanned += releases.length
    for (const release of releases) {
      const torrent = toTorrent({ ...release, bgmId: subject.bgmId, subjectName: subject.nameCn || subject.name })
      if (torrent !== null) items.push(torrent)
    }
  }

  const filtered = items.filter((item) => {
    if (resolution !== '' && item.resolution !== resolution) return false
    if (batch === '1' || batch === 'true') return item.isBatch
    if (batch === '0' || batch === 'false') return !item.isBatch
    if (episode > 0) {
      if (item.isBatch) return item.episodeRange === null || (episode >= item.episodeRange[0] && episode <= item.episodeRange[1])
      return item.episodeNumber === episode
    }
    return true
  })

  filtered.sort((left, right) => (right.seeders ?? 0) - (left.seeders ?? 0))
  return {
    provider: 'anibt',
    scanned,
    matched: filtered.length,
    subjects,
    items: filtered.slice(0, limit),
  }
}

/** Season chart: useful as a fallback "what is airing" list. */
export async function fetchAniBTSeason() {
  const payload = await getJson('/api/seasons/anime')
  const days = payload?.data?.byWeekday ?? []
  const out = []
  for (const day of days) {
    for (const anime of day.animes ?? []) {
      out.push({
        bgmId: anime.bgmId ?? null,
        name: anime.name ?? '',
        nameCn: anime.nameCn ?? '',
        image: anime.image ?? '',
        weekday: day.weekday ?? null,
        hasRelease: anime.hasRelease === true,
        year: anime.seasonYear ?? null,
        season: anime.season ?? '',
      })
    }
  }
  return out
}

export const ANIBT_LABEL = 'AniBT'
