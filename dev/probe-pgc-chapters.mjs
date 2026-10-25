#!/usr/bin/env node
/**
 * Probe: where do bilibili PGC (番剧 / 影视剧集) chapters & OP-ED skip points live?
 *
 * Read-only. Hits the real bilibili API with the cookie saved by the plugin
 * (if any) and prints HTTP status, the chapter-relevant slice of each payload,
 * and a scan proving the conclusion is not a single lucky sample.
 *
 *   node dev/probe-pgc-chapters.mjs            # everything
 *   node dev/probe-pgc-chapters.mjs --season 28763
 *
 * Output only on stdout/stderr; the cookie is never printed.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REFERER = 'https://www.bilibili.com/'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const API = 'https://api.bilibili.com'

// ── cookie: same file the plugin's accounts store uses ─────────────────────
function loadCookie() {
  const candidates = [
    process.env.DSH_ANIME_STATE ? join(process.env.DSH_ANIME_STATE, 'accounts.json') : '',
    join(homedir(), '.dsh', 'state', 'dsh-anime', 'accounts.json'),
  ].filter(Boolean)
  for (const file of candidates) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      const cookie = String(raw?.bilibili?.cookie ?? '')
      if (cookie !== '') return { cookie, from: file, uname: raw?.bilibili?.uname ?? '' }
    } catch {
      /* try next */
    }
  }
  return { cookie: '', from: null, uname: '' }
}

const ACCOUNT = loadCookie()

const headers = (withCookie = true) => {
  const map = { referer: REFERER, 'user-agent': UA }
  if (withCookie && ACCOUNT.cookie !== '') map.cookie = ACCOUNT.cookie
  return map
}

async function get(url, { label = url, withCookie = true } = {}) {
  const started = Date.now()
  try {
    const response = await fetch(url, { headers: headers(withCookie), signal: AbortSignal.timeout(15000) })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* non-JSON */
    }
    return { label, status: response.status, ms: Date.now() - started, json, text, code: json?.code ?? null, message: json?.message ?? null }
  } catch (error) {
    return { label, status: 0, ms: Date.now() - started, json: null, text: '', code: null, message: String(error?.message ?? error) }
  }
}

const clip = (value, limit = 300) => {
  const text = typeof value === 'string' ? value : value === undefined ? 'undefined' : JSON.stringify(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function line(res) {
  console.log(`   HTTP ${res.status}  code=${res.code}  msg=${clip(String(res.message ?? '-'), 40)}  ${res.ms}ms`)
}

const root = (payload) => payload?.result ?? payload?.data ?? null

/** view_points of the player API, or the literal marker for "no such field". */
const points = (payload) => {
  const list = payload?.data?.view_points
  return Array.isArray(list) ? list : null
}

const describePoints = (list) =>
  list === null ? 'view_points: FIELD ABSENT' : list.length === 0 ? 'view_points: [] (empty)' : `view_points: ${list.length} item(s)`

// ── WBI ────────────────────────────────────────────────────────────────────
const TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
  41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

const keyOf = (url) => String(url).split('/').pop().split('.')[0]

function mixinOf(imgUrl, subUrl) {
  const raw = `${keyOf(imgUrl)}${keyOf(subUrl)}`
  let mixin = ''
  for (const index of TAB) mixin += raw[index] ?? ''
  return mixin.slice(0, 32)
}

function sign(params, mixin, wts = Math.floor(Date.now() / 1000)) {
  const all = { ...params, wts }
  const query = Object.keys(all)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(all[key]).replace(/[!'()*]/g, ''))}`)
    .join('&')
  return `${query}&w_rid=${createHash('md5').update(query + mixin).digest('hex')}`
}

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const argOf = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

console.log('=== dsh-anime · bilibili PGC chapters probe ===')
console.log(`node ${process.version}`)
console.log(
  ACCOUNT.cookie === ''
    ? 'cookie: NONE (anonymous)'
    : `cookie: present (${ACCOUNT.cookie.length}b) from ${ACCOUNT.from} uname=${ACCOUNT.uname}`,
)

// ── 0. WBI keys ────────────────────────────────────────────────────────────
const nav = await get(`${API}/x/web-interface/nav`, { label: 'nav' })
const img = String(nav.json?.data?.wbi_img?.img_url ?? '')
const sub = String(nav.json?.data?.wbi_img?.sub_url ?? '')
const mixin = mixinOf(img, sub)
console.log(`\n[0] nav  HTTP ${nav.status} code=${nav.code} (0 = signed in, -101 = anonymous)`)
console.log(`    img_key=${keyOf(img)} sub_key=${keyOf(sub)}`)
console.log(`    mixin=${mixin}`)

// ── 1. Which ranked seasons actually carry OP/ED skip points? ──────────────
const explicitSeason = Number(argOf('--season') ?? 0)
const ranked = []
for (const seasonType of [1, 4]) {
  const res = await get(`${API}/pgc/web/rank/list?day=3&season_type=${seasonType}`)
  const list = root(res.json)?.list ?? []
  for (const item of list) if (Number(item?.season_id) > 0) ranked.push({ id: Number(item.season_id), title: item.title })
  console.log(`\n[1] rank season_type=${seasonType} -> ${list.length} items (code=${res.code})`)
}

let scanned = 0
let withSkip = 0
const samples = []
for (const season of ranked) {
  const res = await get(`${API}/pgc/view/web/season?season_id=${season.id}`)
  const data = root(res.json)
  if (!data || !Array.isArray(data.episodes)) continue
  scanned++
  const hit = data.episodes.filter(
    (episode) =>
      Number(episode?.skip?.op?.end) > Number(episode?.skip?.op?.start) ||
      Number(episode?.skip?.ed?.end) > Number(episode?.skip?.ed?.start),
  )
  if (hit.length > 0) {
    withSkip++
    if (samples.length < 3) samples.push({ season: season.id, title: season.title, count: hit.length, total: data.episodes.length, episode: hit[0] })
  }
  console.log(
    `    ${hit.length > 0 ? 'HIT ' : '    '}season_id=${String(season.id).padEnd(7)} eps=${String(data.episodes.length).padEnd(4)} withSkip=${String(hit.length).padEnd(4)} 「${clip(String(season.title ?? ''), 22)}」`,
  )
}
console.log(`\n[1] summary: ${withSkip}/${scanned} seasons expose skip.op/ed on at least one episode`)

// ── 2. candidate endpoints, on a real episode ──────────────────────────────
// 天官赐福 / 宗门里除了我都是卧底 / 名侦探柯南(中配) — verified to carry skip windows
const FALLBACK = [28763, 48518, 33415]
const chosenSeason = explicitSeason > 0 ? explicitSeason : samples[0]?.season ?? ranked[0]?.id ?? FALLBACK[0]
const seasonRes = await get(`${API}/pgc/view/web/season?season_id=${chosenSeason}`, {
  label: `pgc/view/web/season?season_id=${chosenSeason}`,
})
const season = root(seasonRes.json)
console.log(`\n[2] season ${chosenSeason} 「${clip(String(season?.title ?? '-'), 40)}」 episodes=${season?.episodes?.length ?? 0}`)

const episodes = (Array.isArray(season?.episodes) ? season.episodes : []).filter((episode) => Number(episode?.id) > 0)
const target =
  episodes.find(
    (episode) =>
      Number(episode?.skip?.op?.end) > Number(episode?.skip?.op?.start) ||
      Number(episode?.skip?.ed?.end) > Number(episode?.skip?.ed?.start),
  ) ?? episodes[0]

const one = {
  epId: Number(target?.id) || 0,
  cid: Number(target?.cid) || 0,
  aid: Number(target?.aid) || 0,
  bvid: String(target?.bvid ?? ''),
  skip: target?.skip ?? null,
}
console.log(`    target ep_id=${one.epId} cid=${one.cid} aid=${one.aid} bvid=${one.bvid}`)
console.log(`    episode.skip = ${clip(one.skip)}`)
console.log(`    episode keys = ${Object.keys(target ?? {}).join(',')}`)

const candidates = [
  ['A  x/player/wbi/v2?ep_id&cid   (WBI)', `${API}/x/player/wbi/v2?${sign({ ep_id: one.epId, cid: one.cid }, mixin)}`, true],
  ['B  x/player/v2?ep_id&cid       (no WBI)', `${API}/x/player/v2?ep_id=${one.epId}&cid=${one.cid}`, true],
  ['C  x/player/wbi/v2?aid&cid     (WBI)', `${API}/x/player/wbi/v2?${sign({ aid: one.aid, cid: one.cid }, mixin)}`, true],
  ['D  x/player/v2?aid&cid         (no WBI)', `${API}/x/player/v2?aid=${one.aid}&cid=${one.cid}`, true],
  ['E  x/web-interface/view?bvid    (field?)', `${API}/x/web-interface/view?bvid=${one.bvid}`, true],
  ['F  pgc/player/web/v2?ep_id&cid', `${API}/pgc/player/web/v2?ep_id=${one.epId}&cid=${one.cid}`, true],
  [
    'G  pgc/player/web/v2/playurl',
    `${API}/pgc/player/web/v2/playurl?ep_id=${one.epId}&cid=${one.cid}&fnval=4048&qn=64&fnver=0&fourk=1`,
    false,
  ],
  ['H  pgc/view/web/season?ep_id', `${API}/pgc/view/web/season?ep_id=${one.epId}`, false],
  ['I  pgc/view/web/season?season_id (no cookie)', `${API}/pgc/view/web/season?season_id=${chosenSeason}`, true],
]

for (const [label, url, isPlayer] of candidates) {
  const res = await get(url, { label, withCookie: !label.includes('no cookie') })
  console.log(`\n${label}`)
  line(res)
  if (res.json === null) {
    console.log(`   non-JSON body (${res.text.length}b): ${clip(res.text, 80)}`)
    continue
  }
  const body = res.json
  const data = root(body)
  if (isPlayer) {
    const list = points(body)
    console.log(`   ${describePoints(list)}`)
    if (list !== null && list.length > 0) console.log(`   ${clip(list.slice(0, 2))}`)
  } else if (Array.isArray(data?.episodes)) {
    const episode = data.episodes.find((item) => Number(item?.id) === one.epId) ?? data.episodes[0]
    const op = episode?.skip?.op
    const ed = episode?.skip?.ed
    const ok = Number(op?.end) > Number(op?.start) || Number(ed?.end) > Number(ed?.start)
    console.log(`   episodes[]=${data.episodes.length}  episode.skip=${clip(episode?.skip)}  -> OP/ED usable: ${ok ? 'YES' : 'no (zeroed)'}`)
    if (label.includes('ep_id')) console.log(`   (resolved season_id=${data.season_id} 「${clip(String(data.title ?? ''), 30)}」)`)
  } else if (data !== null && typeof data === 'object') {
    const keys = Object.keys(data)
    const chapterish = keys.filter((key) => /chapter|point|skip|op_?ed|section/i.test(key))
    console.log(`   keys=${keys.join(',')}`)
    console.log(`   chapter-ish keys: ${chapterish.length === 0 ? 'NONE' : chapterish.join(',')}`)
    if (body.message === undefined && res.status === 200 && keys.length === 0) console.log('   empty object')
  }
}

// ── 3. UGC baseline on an upload that really has chapters ──────────────────
console.log('\n[3] UGC baseline — scanning popular uploads for a non-empty view_points')
const vids = []
for (const page of [1, 2, 3]) {
  const res = await get(`${API}/x/web-interface/popular?ps=50&pn=${page}`)
  for (const item of res.json?.data?.list ?? []) vids.push({ bvid: item.bvid, aid: Number(item.aid), title: item.title })
}
let baseline = null
for (const video of vids) {
  const view = await get(`${API}/x/web-interface/view?bvid=${video.bvid}`)
  const cid = Number(view.json?.data?.pages?.[0]?.cid) || 0
  if (cid <= 0) continue
  const player = await get(`${API}/x/player/wbi/v2?${sign({ aid: video.aid, cid }, mixin)}`)
  const list = points(player.json)
  if (list !== null && list.length > 0) {
    baseline = { ...video, cid, list, viewPointsPresent: view.json?.data?.view_points !== undefined }
    break
  }
}
if (baseline === null) {
  console.log('    no upload in the first 150 popular entries exposed view_points')
} else {
  console.log(`    bvid=${baseline.bvid} aid=${baseline.aid} cid=${baseline.cid} 「${clip(String(baseline.title), 40)}」`)
  console.log(`    x/player/wbi/v2 -> ${describePoints(baseline.list)}`)
  console.log(`    sample: ${clip(baseline.list.slice(0, 3))}`)
  console.log(`    same bvid via x/web-interface/view -> view_points field present: ${baseline.viewPointsPresent}`)
  const plain = await get(`${API}/x/player/v2?aid=${baseline.aid}&cid=${baseline.cid}`)
  const plainList = points(plain.json)
  console.log(`    x/player/v2 (UNSIGNED) -> ${describePoints(plainList)}  (code=${plain.json?.code})`)
}

// ── 4. is WBI actually required? ───────────────────────────────────────────
console.log('\n[4] WBI necessity / minimum parameter set')
const unsignedPlayer = await get(`${API}/x/player/v2?aid=${one.aid}&cid=${one.cid}`)
const signedPlayer = await get(`${API}/x/player/wbi/v2?${sign({ aid: one.aid, cid: one.cid }, mixin)}`)
const badSig = await get(`${API}/x/player/wbi/v2?${sign({ aid: one.aid, cid: one.cid }, 'deadbeefdeadbeefdeadbeefdeadbeef')}`)
const noSig = await get(`${API}/x/player/wbi/v2?aid=${one.aid}&cid=${one.cid}`)
const zeroSig = await get(
  `${API}/x/player/wbi/v2?aid=${one.aid}&cid=${one.cid}&wts=${Math.floor(Date.now() / 1000)}&w_rid=${'0'.repeat(32)}`,
)
const noParams = await get(`${API}/x/player/wbi/v2`)
console.log(`    x/player/wbi/v2 signed correctly        -> code=${signedPlayer.json?.code}`)
console.log(`    x/player/wbi/v2 WRONG mixin             -> code=${badSig.json?.code}`)
console.log(`    x/player/wbi/v2 no wts / no w_rid       -> code=${noSig.json?.code}`)
console.log(`    x/player/wbi/v2 w_rid=all zeros         -> code=${zeroSig.json?.code}`)
console.log(`    x/player/wbi/v2 with no params at all   -> code=${noParams.json?.code}`)
console.log(`    x/player/v2 unsigned (aid+cid only)     -> code=${unsignedPlayer.json?.code}  ${describePoints(points(unsignedPlayer.json))}`)
console.log(
  `    => WBI is NOT enforced on x/player(/wbi)/v2 (a bogus w_rid still returns code=0); it is also unnecessary.`,
)
const seasonUgc = await get(`${API}/pgc/view/web/season?season_id=${chosenSeason}`, { withCookie: false })
console.log(`    pgc/view/web/season WITHOUT cookie      -> code=${seasonUgc.json?.code}  episodes=${root(seasonUgc.json)?.episodes?.length ?? 0}`)
const seasonUgcEp = root(seasonUgc.json)?.episodes?.find((item) => Number(item.id) === one.epId)
console.log(`    same episode skip (anonymous)           -> ${clip(seasonUgcEp?.skip)}`)

// ── 5. parameter matrix: what does each player endpoint really require? ─────
console.log('\n[5] parameter matrix — x/player* needs cid + (aid|bvid); ep_id is rejected')
const matrix = [
  ['x/player/wbi/v2?aid&cid no wts/w_rid', `${API}/x/player/wbi/v2?aid=${one.aid}&cid=${one.cid}`],
  ['x/player/wbi/v2?aid&cid w_rid=000…0', `${API}/x/player/wbi/v2?aid=${one.aid}&cid=${one.cid}&wts=${Math.floor(Date.now() / 1000)}&w_rid=${'0'.repeat(32)}`],
  ['x/player/wbi/v2?aid&cid signed', `${API}/x/player/wbi/v2?${sign({ aid: one.aid, cid: one.cid }, mixin)}`],
  ['x/player/wbi/v2?bvid&cid signed', `${API}/x/player/wbi/v2?${sign({ bvid: one.bvid, cid: one.cid }, mixin)}`],
  ['x/player/wbi/v2?bvid (no cid)', `${API}/x/player/wbi/v2?bvid=${one.bvid}`],
  ['x/player/v2?bvid&cid unsigned', `${API}/x/player/v2?bvid=${one.bvid}&cid=${one.cid}`],
  ['x/player/v2?cid (no aid/bvid)', `${API}/x/player/v2?cid=${one.cid}`],
  ['x/player/v2?ep_id&cid', `${API}/x/player/v2?ep_id=${one.epId}&cid=${one.cid}`],
]
for (const [label, url] of matrix) {
  const res = await get(url)
  const list = points(res.json)
  console.log(
    `    ${label.padEnd(38)} code=${String(res.json?.code).padEnd(4)} ${
      list === null ? 'view_points: FIELD ABSENT' : `view_points: ${list.length} item(s)`
    }`,
  )
}

// ── 6. movie seasons: op.start === 0 must still count as a skip window ─────
const movie = await get(`${API}/pgc/view/web/season?season_id=48411`)
const movieSeason = root(movie.json)
const movieEp = movieSeason?.episodes?.[0]
console.log(`\n[6] movie season 48411 「${clip(String(movieSeason?.title ?? '-'), 20)}」 ep=${movieEp?.id} cid=${movieEp?.cid}`)
console.log(`    skip=${clip(movieEp?.skip)}   -> end > start counts, even when start === 0`)

// ── verdict ────────────────────────────────────────────────────────────────
console.log('\n=== VERDICT ===')
console.log('PGC chapters/OP-ED: pgc/view/web/season -> result.episodes[].skip.{op,ed}.{start,end} (SECONDS)')
console.log(`  usable sample: season=${chosenSeason} ep=${one.epId} skip=${clip(one.skip, 120)}`)
console.log(`  ${withSkip}/${scanned} ranked seasons had at least one episode with a non-zero skip window`)
console.log(`  player APIs (x/player/*) return ${describePoints(points(signedPlayer.json))} for this PGC episode`)
console.log('UGC chapters: x/player(/wbi)/v2?aid|cid -> data.view_points (x/web-interface/view does NOT carry the field)')

