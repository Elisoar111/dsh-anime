/**
 * AnimeTosho search (HTML scraping).
 *
 * AnimeTosho is the only torrent index reachable from this network (nyaa.si,
 * sukebei, mikan, acg.rip all fail), and it needs no authentication: the search
 * page is plain server-rendered HTML with one `home_list_entry` per release,
 * followed by links to the .torrent and the magnet URI.
 */

const BASE = 'https://animetosho.org'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#039': "'",
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => {
      if (NAMED_ENTITIES[`#${dec}`] !== undefined) return NAMED_ENTITIES[`#${dec}`]
      const code = Number(dec)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    })
    .replace(/&([a-z]+);/gi, (match, name) => {
      const mapped = NAMED_ENTITIES[name.toLowerCase()]
      return mapped === undefined ? match : mapped
    })
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** BitTorrent magnets may carry the info hash in base32; browsers and clients want hex. */
function base32ToHex(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of value.toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index === -1) return ''
    bits += index.toString(2).padStart(5, '0')
  }
  let hex = ''
  for (let index = 0; index + 4 <= bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16)
  }
  return hex
}

function parseInfoHash(magnet) {
  const match = /urn:btih:([0-9a-z]+)/i.exec(magnet)
  if (match === null) return ''
  const raw = match[1]
  if (raw.length === 40) return raw.toLowerCase()
  if (raw.length === 32) return base32ToHex(raw)
  return ''
}

function detectResolution(title) {
  const match = /(?:^|[\s._[(])(2160p|1080p|900p|720p|576p|480p)(?:[\s._\])]|$)/i.exec(title)
  return match === null ? '' : match[1].toLowerCase()
}

function detectBatch(title) {
  return /\b(batch|complete|bd\s*box|全集)\b/i.test(title) || /\bS\d{1,2}\s*[-~]\s*S\d{1,2}\b/i.test(title)
}

function detectEpisode(title) {
  const patterns = [
    /\bS\d{1,2}E(\d{1,4})\b/i,
    /\bE(?:p)?\s?(\d{1,4})(?:v\d)?\b/i,
    /\s-\s(\d{1,4})(?:v\d)?(?:\s|$|\[|\()/,
    /\[\s*(\d{1,4})(?:v\d)?\s*\]/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(title)
    if (match !== null) {
      const value = Number(match[1])
      if (value > 0 && value < 3000) return value
    }
  }
  return 0
}

function detectReleaseGroup(title) {
  const match = /^\s*\[([^\]]{1,40})\]/.exec(title)
  if (match !== null) return match[1].trim()
  const suffix = /\s-\s?([A-Za-z0-9]{2,20})$/.exec(title)
  return suffix === null ? '' : suffix[1]
}

/** Split the page into entries, keeping the preceding day separator with each entry. */
export function parseAnimeToshoEntries(html) {
  const chunks = html.split(/(?=<div class="home_list_(?:datesep|entry))/)
  const entries = []
  let currentDate = ''
  for (const chunk of chunks) {
    if (chunk.startsWith('<div class="home_list_datesep"')) {
      const match = /<div class="home_list_datesep">([^<]*)<\/div>/.exec(chunk)
      if (match !== null) currentDate = match[1].trim()
      continue
    }
    if (!chunk.startsWith('<div class="home_list_entry')) continue
    const body = chunk.slice(0, 6000)

    const titleMatch = /class="link"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(body)
    if (titleMatch === null) continue
    const title = stripTags(titleMatch[2])
    if (title === '') continue

    const magnetMatch = /href="(magnet:\?[^"]+)"/.exec(body)
    const magnet = magnetMatch === null ? '' : decodeEntities(magnetMatch[1])
    const torrentMatch = /href="(https:\/\/[^"]+\.torrent)"/.exec(body)
    const seriesMatch = /class="serieslink"><a[^>]*>([\s\S]*?)<\/a>/.exec(body)
    const sizeMatch = /class="size" title="Total file size: ([\d,]+) bytes"/.exec(body)
    const sizeLabelMatch = /class="size"[^>]*>([^<]+)</.exec(body)
    const seedMatch = /title="Seeders: (\d+) \/ Leechers: (\d+)"/.exec(body)
    const filesMatch = /\((\d+) files?\)/.exec(body)
    const dateMatch = /class="date" title="Date\/time submitted: ([^"]+)"/.exec(body)

    entries.push({
      title,
      viewUrl: titleMatch[1],
      seriesName: seriesMatch === null ? '' : stripTags(seriesMatch[1]),
      magnet,
      torrentUrl: torrentMatch === null ? '' : decodeEntities(torrentMatch[1]),
      infoHash: parseInfoHash(magnet),
      size: sizeMatch === null ? 0 : Number(sizeMatch[1].replace(/,/g, '')),
      sizeLabel: sizeLabelMatch === null ? '' : sizeLabelMatch[1].trim(),
      seeders: seedMatch === null ? 0 : Number(seedMatch[1]),
      leechers: seedMatch === null ? 0 : Number(seedMatch[2]),
      fileCount: filesMatch === null ? 1 : Number(filesMatch[1]),
      submittedAt: dateMatch === null ? currentDate : dateMatch[1],
      resolution: detectResolution(title),
      isBatch: detectBatch(title),
      episodeNumber: detectEpisode(title),
      releaseGroup: detectReleaseGroup(title),
    })
  }
  return entries
}

function formatSize(bytes) {
  if (bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`
}

/**
 * Search AnimeTosho and filter down to releases that plausibly answer
 * "episode N of this title at this resolution".
 */
export async function searchAnimeTosho(options = {}) {
  const query = String(options.query ?? '').trim()
  if (query === '') return { items: [], total: 0, query, url: '' }
  const page = Math.max(1, Math.min(5, Number(options.page ?? 1) || 1))
  const params = new URLSearchParams({ q: query, order: 'date-desc' })
  if (page > 1) params.set('page', String(page))
  const url = `${BASE}/search?${params.toString()}`

  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
  })
  if (!response.ok) throw new Error(`animetosho 返回 ${response.status}`)
  const html = await response.text()
  const all = parseAnimeToshoEntries(html)

  const wantedEpisode = Number(options.episode ?? 0) || 0
  const wantedResolution = String(options.resolution ?? '').toLowerCase()
  const batchMode = String(options.batch ?? '')

  let items = all
  if (wantedResolution !== '' && wantedResolution !== 'any') {
    const matching = items.filter((item) => item.resolution === wantedResolution)
    if (matching.length > 0) items = matching
  }
  if (wantedEpisode > 0) {
    const matching = items.filter(
      (item) => item.isBatch || item.episodeNumber === wantedEpisode,
    )
    if (matching.length > 0) items = matching
  }
  if (batchMode === 'only') items = items.filter((item) => item.isBatch)
  if (batchMode === 'exclude') items = items.filter((item) => !item.isBatch)

  items = items
    .filter((item) => item.magnet !== '')
    .map((item) => ({ ...item, formattedSize: formatSize(item.size) }))
    .sort((left, right) => right.seeders - left.seeders || right.size - left.size)

  return {
    items: items.slice(0, 60),
    total: items.length,
    scanned: all.length,
    query,
    url,
  }
}
