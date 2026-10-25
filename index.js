/**
 * @local/dsh-anime — Host half.
 *
 * Serves the anime data the page needs on its own exact routes, because the
 * third-party APIs cannot be called from the page: AniList wants a POST with a
 * JSON body, Bangumi wants its own User-Agent, and neither sends CORS headers.
 * The Host proxies them (with a small TTL cache) and the Client only ever talks
 * to same-origin `/dsh-anime/api/*`.
 *
 * Two data sources, as requested:
 *   - AniList (https://graphql.anilist.co) — the anime database: seasonal,
 *     trending, search, airing schedule, details.
 *   - Bangumi 番组计划 (https://api.bgm.tv) — the Chinese database: weekly
 *     calendar and subject search.
 *
 * Every upstream failure is reported as `200 { ok: false, error }` so the page
 * can render a friendly "source unavailable" state instead of guessing at a
 * thrown promise. `404` is reserved for an unknown route.
 */

/** Upstreams are rate-limited; one polite identity for every call. */
const USER_AGENT = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve as resolvePath, dirname, extname } from 'node:path'
import { mkdirSync, copyFileSync, writeFileSync, readdirSync, statSync, createReadStream, existsSync, renameSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { searchAnimeTosho } from './lib/animetosho.js'
import { readChapters } from './lib/chapters.js'
import { searchAniBT } from './lib/anibt.js'
import {
  createTorrentService,
  createTranscodeStream,
  detectPlayers,
  findFfmpeg,
  openInPlayer,
  parseRange,
  probeDurationSeconds,
  probeStream,
  STATE_DIR,
} from './lib/torrent-engine.js'
import { createExtensionRegistry, EXTENSION_TYPES, TYPE_LABELS } from './lib/extensions.js'
import * as embeddedMpv from './lib/mpv.js'
import { mixinKey, signQuery } from './lib/wbi.js'
import { createBilibili, bilibiliAccount, BILIBILI_API, BILIBILI_REFERER, BILIBILI_UA } from './lib/bilibili.js'
import { fqdmExtension, fqdmServers } from './lib/fqdm.js'
import * as anich from './lib/anich.js'
import { registerWebSources } from './lib/websource.js'
import { anilistAccount } from './lib/anilist.js'
import * as bgm from './lib/bangumi.js'
import { bangumiAccount } from './lib/bangumi.js'
import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE,
  coerceSettings,
  engineOptions,
  loadSettings,
  publicSettings,
  resetSettings,
  resolvePaths,
  saveSettings,
} from './lib/settings.js'
import { createDownloads } from './lib/downloads.js'
import {
  createAccountStore,
  publicAccounts,
} from './lib/accounts.js'

/**
 * Credentials for the current process, read straight from the store: a login
 * saved on the settings page is live on the next request, with no refresh step
 * to forget. The store caches the file by mtime, so this is cheap.
 */
let accountStore = null
const ACCOUNT = new Proxy(
  {},
  {
    get: (_target, key) => (typeof key === 'string' ? (accountStore?.get(key)?.secret ?? '') : ''),
  },
)

/** The fingerprint cookie still has to accompany the account cookie. */
function combineCookie(jarCookie, accountCookie) {
  const parts = []
  if (typeof jarCookie === 'string' && jarCookie !== '') parts.push(jarCookie)
  if (typeof accountCookie === 'string' && accountCookie !== '') parts.push(accountCookie)
  return parts.join('; ')
}

const ANILIST_ENDPOINT = 'https://graphql.anilist.co'
const BANGUMI_ENDPOINT = 'https://api.bgm.tv'
/** See lib/bangumi.js: the mirror is what actually answers from this network. */
const BANGUMI_MIRROR = 'https://bgmapi.anibt.net'
/**
 * Animeko (`https://animeko.org`) does not call Bangumi from the app: it runs
 * its own server (`open-ani/ani-api-server`), which merges the Bangumi database
 * into one of its own, and the client only ever talks to that API. The
 * read-only endpoints this page needs — a subject, a keyword search and the
 * seasonal schedule — answer without a token, and a cover is addressable by
 * subject id, so a schedule entry needs no follow-up request.
 */
const ANIMEKO_ENDPOINT = 'https://api.animeko.org'
const ANIMEKO_STATIC = 'https://static.myani.org'

/**
 * Bilibili is the playable source: on this network AniList answers and Bangumi
 * does not, and bilibili's PGC player hands out real MP4 URLs to anonymous
 * callers as long as the request carries a browser identity plus its Referer.
 * The page therefore watches through `/bili/stream`, which rewrites those
 * headers and pipes the bytes back on the same origin. The identity itself
 * (endpoint, Referer, UA) belongs to the online source and is imported from
 * lib/bilibili.js, so there is one copy of it.
 */

/**
 * Community source catalogue (onlinestream / torrentstream providers).
 * The GitHub mirror is used first: raw.githubusercontent.com is unreachable on
 * a number of networks where anilist.co and bgm.tv are fine.
 */
const SOURCE_CATALOGUE_URLS = [
  'https://cdn.jsdelivr.net/gh/Bas1874/Seanime-Marketplace@main/Marketplace/Main.json',
  'https://raw.githubusercontent.com/Bas1874/Seanime-Marketplace/refs/heads/main/Marketplace/Main.json',
]
const SOURCE_PROVIDER_TYPES = new Set(['onlinestream-provider', 'anime-torrent-provider'])

const ROUTE_PREFIX = '/dsh-anime/api'

/** Bumped whenever the host half changes, so the page can spot a stale host. */
const PLUGIN_BUILD = '2026-10-25.99'

/** Read from package.json, not typed twice: /health reported 1.0.0 for eleven
 *  releases because this number was a literal here. */
function readPackageVersion() {
  try {
    const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    return typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}
const PLUGIN_VERSION = readPackageVersion()

/** path -> dispose of the route this module currently owns (survives reloads). */
/**
 * One registration per path for the whole process: the host rejects a second
 * exact route, and the plugin is applied more than once (reload, a second
 * instance). Each path is registered once with a dispatcher that reads the
 * handler the newest apply published.
 */
const ROUTE_REGISTRY = (globalThis[Symbol.for('dsh-anime.routes')] ??= {
  paths: new Set(),
  handlers: new Map(),
})

/** Last client build the page reported, kept across reloads for health. */
const CLIENT_BUILD_SEEN = (globalThis[Symbol.for('dsh-anime.client-build')] ??= { at: 0, build: '' })

/** GET route prefix -> extension id, so a disabled source stops answering. */
const ROUTE_GUARD = { anilist: 'anilist', bangumi: 'bangumi', animeko: 'animeko', bili: 'bilibili' }

/**
 * Which files back each extension. The page can ask to see them, but only the
 * paths listed here — an id never becomes a path.
 */
const PLUGIN_DIR = fileURLToPath(new URL('.', import.meta.url))
/** Static assets the page loads itself live under here. */
const PLUGIN_ROOT = PLUGIN_DIR
const MIME_BY_EXTENSION = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}
const SOURCE_FILES = {
  anilist: ['index.js'],
  bangumi: ['index.js'],
  animeko: ['index.js'],
  anibt: ['lib/anibt.js'],
  animetosho: ['lib/animetosho.js'],
  bilibili: ['lib/bilibili.js'],
}
const SOURCE_MAX_BYTES = 400 * 1024

/** Keep the previous version next to the state, so a bad save can be undone. */
function backupSource(absolute) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = resolvePath(STATE_DIR, 'backups')
  mkdirSync(dir, { recursive: true })
  const target = resolvePath(dir, `${absolute.split(/[\\/]/).pop()}.${stamp}.bak`)
  copyFileSync(absolute, target)
  return target
}

/** Newest first, so "restore" always means "the version before this one". */
function listBackups(absolute) {
  const name = absolute.split(/[\\/]/).pop()
  const dir = resolvePath(STATE_DIR, 'backups')
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch (error) {
    return []
  }
  return entries
    .filter((entry) => entry.startsWith(`${name}.`) && entry.endsWith('.bak'))
    .sort()
    .reverse()
    .slice(0, 20)
    .map((entry) => {
      const full = resolvePath(dir, entry)
      let bytes = 0
      try {
        bytes = statSync(full).size
      } catch (error) {
        bytes = 0
      }
      return { name: entry, at: entry.slice(name.length + 1, entry.length - 4), bytes }
    })
}

/** Reject code that will not even parse, instead of breaking the plugin. */
function checkSyntax(absolute) {
  return new Promise((done) => {
    execFile(process.execPath, ['--check', absolute], { timeout: 20000 }, (error, _stdout, stderr) => {
      if (error === null) return done({ ok: true })
      return done({ ok: false, message: String(stderr || error.message).trim().split('\n').slice(-6).join('\n') })
    })
  })
}

/** Fields every media card and detail view needs, in one fragment. */
const MEDIA_FIELDS = `
  id
  title { romaji english native userPreferred }
  synonyms
  coverImage { extraLarge large medium color }
  bannerImage
  description(asHtml: false)
  averageScore
  meanScore
  popularity
  episodes
  duration
  status
  format
  season
  seasonYear
  genres
  isAdult
  siteUrl
  nextAiringEpisode { airingAt timeUntilAiring episode }
`

const QUERY_SEASON = `
  query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, season: $season, seasonYear: $year, sort: $sort, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`

const QUERY_TRENDING = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }
`

/**
 * Search uses a lighter fragment on purpose: asking AniList for 30 synopses in
 * one relevance query is slow enough to blow the request deadline, and the
 * page loads the full description only when a card is opened.
 */
const MEDIA_FIELDS_LIGHT = `
  id
  title { romaji english native userPreferred }
  synonyms
  coverImage { large medium color }
  averageScore
  episodes
  format
  season
  seasonYear
  status
  siteUrl
  isAdult
  nextAiringEpisode { airingAt timeUntilAiring episode }
`

const QUERY_SEARCH = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, search: $search, isAdult: false) {
        ${MEDIA_FIELDS_LIGHT}
      }
    }
  }
`

/**
 * The browse page: every filter is optional and simply left out of the query
 * when unused, because AniList rejects a null enum (`format: null` is an error,
 * an absent argument is not). `search` and `genre`/`tag` compose fine, so the
 * same query backs both "type a name" and "browse by facet".
 */
const QUERY_BROWSE = `
  query ($search: String, $genre: String, $tag: String, $format: MediaFormat,
          $season: MediaSeason, $year: Int, $status: MediaStatus,
          $score: Int, $adult: Boolean, $sort: [MediaSort],
          $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage total }
      media(type: ANIME, search: $search, genre: $genre, tag: $tag,
            format: $format, season: $season, seasonYear: $year,
            status: $status, averageScore_greater: $score,
            isAdult: $adult, sort: $sort) {
        ${MEDIA_FIELDS_LIGHT}
        genres
      }
    }
  }
`

/** AniList's own enum values; anything else is dropped rather than sent. */
const BROWSE_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'])
const BROWSE_SEASONS = new Set(['WINTER', 'SPRING', 'SUMMER', 'FALL'])
const BROWSE_STATUSES = new Set(['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'])
const BROWSE_SORTS = new Set([
  'SEARCH_MATCH',
  'POPULARITY_DESC',
  'SCORE_DESC',
  'TRENDING_DESC',
  'START_DATE_DESC',
  'TITLE_ROMAJI',
  'FAVOURITES_DESC',
])

const QUERY_AIRING = `
  query ($from: Int, $to: Int, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
        id
        airingAt
        episode
        media {
          id
          title { romaji english native userPreferred }
  synonyms
          coverImage { large medium color }
          siteUrl
          episodes
          averageScore
          isAdult
        }
      }
    }
  }
`

/** Only the detail page pays for these; the card queries stay light. */
const DETAIL_FIELDS = `
  studios(isMain: true) { nodes { id name } }
  source(version: 3)
  trailer { id site thumbnail }
  rankings { rank type allTime }
  characters(sort: [ROLE, RELEVANCE], perPage: 18) {
    edges {
      role
      node {
        id
        name { full native }
        image { large }
        description(asHtml: false)
        gender
        age
        dateOfBirth { year month day }
        bloodType
      }
      voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
        id
        name { full }
        image { large }
      }
    }
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        type
        format
        status
        title { romaji native english userPreferred }
        coverImage { large }
        episodes
        seasonYear
      }
    }
  }
`

const QUERY_WATCH_LINK = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji native english userPreferred }
      format
      episodes
      status
      seasonYear
      coverImage { large }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            type
            format
            status
            title { romaji native english userPreferred }
            coverImage { large }
            episodes
            seasonYear
          }
        }
      }
    }
  }
`

const QUERY_MEDIA = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
      ${DETAIL_FIELDS}
    }
  }
`

/**
 * A tiny TTL cache. Anime airing times barely move, and both upstreams rate
 * limit, so a request that repeats within a minute is answered locally.
 * @param {number} ttlMs
 */
function createCache(ttlMs) {
  /** @type {Map<string, { at: number, value: unknown }>} */
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      if (hit === undefined) return undefined
      if (Date.now() - hit.at > ttlMs) {
        entries.delete(key)
        return undefined
      }
      return hit.value
    },
    delete(key) {
      entries.delete(key)
    },
    set(key, value) {
      if (entries.size > 400) entries.clear()
      entries.set(key, { at: Date.now(), value })
      return value
    },
  }
}

/**
 * `fetch` with a deadline and a JSON contract. Every failure becomes an Error
 * with a message short enough to show in the page.
 */
/** The saved token for whichever service this URL belongs to. */
function bearerFor(url) {
  try {
    const host = new URL(url).host
    if (host === 'api.bgm.tv') return ACCOUNT.bangumi
    if (host === 'graphql.anilist.co') return ACCOUNT.anilist
    return ''
  } catch {
    return ''
  }
}

async function requestJson(url, init = {}, timeoutMs = 20000, attempt = 1) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        ...(bearerFor(url) === '' ? {} : { authorization: `Bearer ${bearerFor(url)}` }),
        ...(init.headers ?? {}),
      },
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${new URL(url).host} responded ${response.status}`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${new URL(url).host} returned a non-JSON body`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${new URL(url).host} timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    // A dropped connection is worth one retry; a real HTTP error is not.
    const dropped =
      error instanceof TypeError ||
      (error instanceof Error && /fetch failed|ECONNRESET|socket hang up/iu.test(error.message))
    if (dropped && attempt < 2) {
      clearTimeout(timer)
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
      return requestJson(url, init, timeoutMs, attempt + 1)
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
}

async function anilist(query, variables) {
  // AniList rate-limits bursts and sometimes sits on a connection for the whole
  // timeout; one quiet retry turns those into a slow answer instead of an error.
  const send = () =>
    requestJson(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  let payload = null
  try {
    payload = await send()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/timed out|aborted|fetch failed/i.test(message)) throw error
    await new Promise((resolve) => setTimeout(resolve, 900))
    payload = await send()
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error(`AniList: ${payload.errors[0]?.message ?? 'query rejected'}`)
  }
  return payload?.data ?? {}
}

/** The season that contains `date`, so the page opens on something useful. */
function seasonOf(date = new Date()) {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month <= 3) return { season: 'WINTER', year }
  if (month <= 6) return { season: 'SPRING', year }
  if (month <= 9) return { season: 'SUMMER', year }
  return { season: 'FALL', year }
}

const SEASONS = new Set(['WINTER', 'SPRING', 'SUMMER', 'FALL'])
const SORTS = {
  popular: 'POPULARITY_DESC',
  score: 'SCORE_DESC',
  trending: 'TRENDING_DESC',
  newest: 'START_DATE_DESC',
  title: 'TITLE_ROMAJI',
}

function clampInt(raw, fallback, min, max) {
  const value = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * Rewrite a GitHub raw URL through the jsDelivr mirror.
 *
 * Both the catalogue JSON and every provider icon/manifest/payload in it point
 * at raw.githubusercontent.com, which is blocked on this network. jsDelivr
 * serves the same bytes over a host that resolves, so the page can still show
 * provider artwork and open a manifest. Anything not on GitHub raw passes
 * through untouched.
 */
function mirrorGitHubRaw(url) {
  if (typeof url !== 'string' || url === '') return url
  const match = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/(?:heads|tags)\/)?([^/]+)\/(.+)$/.exec(url)
  if (match === null) return url
  const [, owner, repo, ref, path] = match
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`
}

/** Bangumi answers `name` in Japanese and `name_cn` in Chinese; show what we have. */
function normalizeBangumiSubject(subject) {
  const images = subject?.images ?? {}
  return {
    id: `bgm-${subject?.id ?? ''}`,
    bgmId: subject?.id ?? null,
    title: subject?.name_cn || subject?.name || '',
    titleRomaji: '',
    titleNative: subject?.name ?? '',
    titleChinese: subject?.name_cn ?? '',
    titleEnglish: '',
    titleOriginal: subject?.name ?? '',
    cover: images.large ?? images.common ?? images.medium ?? images.grid ?? null,
    summary: subject?.summary ?? '',
    /**
     * The v0 API puts the score under `rating`; a couple of the older shapes
     * (and our own mocks) keep it at the top level. Reading only `subject.score`
     * left every 搜索/季度 卡片 without a score even when the site returned one.
     */
    score: (() => {
      const value = subject?.rating?.score ?? subject?.score
      return typeof value === 'number' && value > 0 ? value : null
    })(),
    rank: subject?.rating?.rank ?? subject?.rank ?? null,
    episodes: subject?.eps ?? subject?.total_episodes ?? null,
    date: subject?.date ?? subject?.air_date ?? null,
    url: subject?.id ? `https://bgm.tv/subject/${subject.id}` : null,
    source: 'bangumi',
  }
}

const SEASON_QUARTERS = { WINTER: 1, SPRING: 2, SUMMER: 3, FALL: 4 }

/** Animeko spells a season `2026q4`, which is the same season the page shows. */
function seasonIdOf(season, year) {
  const quarter = SEASON_QUARTERS[String(season ?? '').toUpperCase()] ?? SEASON_QUARTERS.FALL
  return `${clampInt(year, new Date().getFullYear(), 1940, 2100)}q${quarter}`
}

/** Bangumi's v0 search takes an air_date range, and a season is exactly that range. */
function bangumiSeasonRange(season, year) {
  const quarter = SEASON_QUARTERS[String(season ?? '').toUpperCase()] ?? 4
  const firstMonth = (quarter - 1) * 3 + 1
  const start = `${year}-${String(firstMonth).padStart(2, '0')}-01`
  const nextMonth = firstMonth + 3
  const end = nextMonth > 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(nextMonth).padStart(2, '0')}-01`
  return [`>=${start}`, `<${end}`]
}

/** Covers live at a fixed path per subject id, so a schedule row needs no extra request. */
function animekoCover(id, size = 'large') {
  return Number.isFinite(id) && id > 0 ? `${ANIMEKO_STATIC}/subjects/${id}/cover/${size}` : null
}

/**
 * One normalizer covers Animeko's three shapes: a search item, a full subject
 * (`/v2/subjects/{id}`) and a schedule entry (`/v1/schedule/...`). They all
 * share Bangumi's id space, which is what the site link and `bgmId` use.
 *
 * Animeko scores are Bangumi's 0–10 scale, not AniList's 0–100; the page keeps
 * whichever scale arrived and scales the badge instead of the value, so the
 * number stays the number the source shows.
 */
/**
 * The Animeko season endpoint ships only the Japanese name plus the subject's
 * aliases — and the Chinese name is usually one of those aliases (the same list
 * Bangumi keeps). So: drop anything with kana (that is a Japanese alias), then
 * prefer an alias that reads as simplified Chinese, and keep the shortest of
 * the winners (longer aliases tend to bolt on subtitles).
 */
const SIMPLIFIED_ONLY = /[们这来说个时里东点电视乐戏见语读写长飞鸟龙龟周面发斗号与为动剑转马赛强梦幻兽樱战队国学实宝对导岛带帮广厅张弹复忆户执扩扫换摇担据挤败断会条杨业极构枪标样树桥机横历归气没泪测济湾滩无烟热灯营争墙奖独获现产画当疗盘确积稳竞笔节范筑简签纪约红纯纸级纷组细终绍结绝统绿维纲网紧绪练线缘编缓县总绩继续罗义习圣闻联职听声脚胆脸临举旧艰艺华万处虫术卫冲补装规视亲觉观计订讨训记访设许诉注词试话该详认误谁课调谈请证识谱警议护变让艳丰猪猫贝负财贡贫货贵买费资宾卖质赖购赞赶迹践车军软较载轻辆轮输办辞农连进运过达违递远适选遗乡医释钟铁门闭间阅关阳阶际陆随险隐双杂难离雾灵静响页顶顺须领头题颜愿类顾显风养余馆驾验体鱼鸟丽麦黄点党齐齿龟]/u
const TRADITIONAL_ONLY = /[們這來說個時裡東點電視樂戲見語讀寫長飛鳥龍龜週麵髮鬥號與為動劍轉馬賽強夢幻獸櫻戰隊國學實寶對導島帶幫廣廳張彈復憶戶執擴掃換搖擔據擠敗斷會條楊業極構槍標樣樹橋機橫歷歸氣沒淚測濟灣灘無煙熱燈營爭牆獎獨獲現產畫當療盤確積穩競筆節範築簡簽紀約紅純紙級紛組細終紹結絕統綠維綱網緊緒練線緣編緩縣總績繼續羅義習聖聞聯職聽聲腳膽臉臨舉舊艱藝華萬處蟲術衛衝補裝規視親覺觀計訂討訓記訪設許訴註詞試話該詳認誤誰課調談請證識譜警議護變讓豔豐豬貓貝負財貢貧貨貴買費資賓賣質賴購贊趕跡踐車軍軟較載輕輛輪輸辦辭農連進運過達違遞遠適選遺鄉醫釋鐘鐵門閉間閱關陽階際陸隨險隱雙雜難離霧靈靜響頁頂順須領頭題顏願類顧顯風養餘館馬駕驗體魚鳥麗麥黃點黨齊齒龜]/u

function hasChinese(text) {
  return typeof text === 'string' && /[\u4e00-\u9fff]/u.test(text)
}

function hasKana(text) {
  return typeof text === 'string' && /[\u3040-\u30ff\u31f0-\u31ff]/u.test(text)
}

/** Kana means the title is Japanese, not Chinese: a Japanese name written with
 * ideographs only is not a Chinese name, so it must not pass as one. */
/**
 * The Chinese name of an AniList title: an explicit Chinese native title, or the
 * first synonym that is actually written in Chinese.
 */
const SIMPLIFIED_MARKERS = /[这说时们国语爱战灭术电视动开关门长问见现发经历还过让从梦岛风龙剑骑军师侠义团众楼观欢乐别学觉边莲进击巨贵的么样]/

function looksChinese(text) {
  return isChineseTitle(text) && SIMPLIFIED_MARKERS.test(text)
}

function titleChineseFrom(title, synonyms) {
  const native = title?.native ?? ''
  if (looksChinese(native)) return native
  const list = Array.isArray(synonyms) ? synonyms : []
  for (const entry of list) {
    if (typeof entry === 'string' && looksChinese(entry)) return entry
  }
  return ''
}

function isChineseTitle(text) {
  return hasChinese(text) && !hasKana(text)
}

function chineseAliasScore(text) {
  if (!hasChinese(text)) return 0
  if (/[\u3040-\u30ff]/u.test(text)) return 0
  let score = 1
  if (SIMPLIFIED_ONLY.test(text)) score += 2
  if (TRADITIONAL_ONLY.test(text)) score -= 2
  return Math.max(score, 0)
}

function pickChineseTitle(aliases, fallbacks = []) {
  let best = ''
  let bestScore = 0
  for (const alias of Array.isArray(aliases) ? aliases : []) {
    const score = chineseAliasScore(alias)
    if (score === 0) continue
    if (score > bestScore || (score === bestScore && best !== '' && alias.length < best.length)) {
      best = alias
      bestScore = score
    }
  }
  if (best !== '') return best
  for (const fallback of fallbacks) {
    if (typeof fallback === 'string' && fallback !== '') return fallback
  }
  return ''
}

function normalizeAnimekoSubject(raw) {
  const id = Number(raw?.id ?? raw?.subjectId ?? raw?.bangumiId ?? 0) || null
  const titleCn = typeof raw?.nameCn === 'string' ? raw.nameCn : ''
  const titleJa = typeof raw?.name === 'string' ? raw.name : ''
  // A Latin-only nameCn ("dreamland") is worse than a Chinese alias, so the
  // Chinese name wins only when it actually contains Chinese; schedule entries
  // carry no nameCn at all and fall back to their aliases.
  const title = (isChineseTitle(titleCn) ? titleCn : '') || pickChineseTitle(raw?.aliases, [titleCn, titleJa])
  const score = typeof raw?.score === 'number' ? raw.score : Number.parseFloat(raw?.score ?? '')
  const episodes = Array.isArray(raw?.episodes) ? raw.episodes.length : null
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.name)).filter((name) => typeof name === 'string' && name !== '')
    : []
  const begin = typeof raw?.begin === 'string' ? raw.begin : null
  const end = typeof raw?.end === 'string' ? raw.end : null
  const airDate = typeof raw?.airDate === 'string' && raw.airDate !== '' ? raw.airDate : null
  const date = airDate ?? (begin !== null ? begin.slice(0, 10) : null)
  // A schedule entry carries no status; its begin/end window is the status.
  const beginAt = begin !== null ? Date.parse(begin) : airDate !== null ? Date.parse(`${airDate}T00:00:00Z`) : Number.NaN
  const endAt = end !== null ? Date.parse(end) : Number.NaN
  const now = Date.now()
  let status = null
  if (Number.isFinite(beginAt) && beginAt > now + 86400000) status = 'NOT_YET_RELEASED'
  else if (Number.isFinite(endAt) && endAt < now) status = 'FINISHED'
  else if (Number.isFinite(beginAt)) status = 'RELEASING'
  // `relations` ships two parallel arrays, one Japanese and one Chinese name per id.
  const seriesIds = Array.isArray(raw?.relations?.seriesMainSubjectIds) ? raw.relations.seriesMainSubjectIds : []
  const seriesNames = Array.isArray(raw?.relations?.seriesMainSubjectNames) ? raw.relations.seriesMainSubjectNames : []
  const relations = seriesIds
    .map((seriesId, index) => ({
      id: `animeko-${seriesId}`,
      title: seriesNames[index * 2 + 1] || seriesNames[index * 2] || '',
      cover: animekoCover(Number(seriesId), 'large'),
      relation: '',
      format: '',
      year: null,
      status: '',
    }))
    .filter((relation) => relation.title !== '' && relation.id !== `animeko-${id}`)
  return {
    id: `animeko-${id ?? ''}`,
    animekoId: id,
    bgmId: id,
    title,
    titleOriginal: titleJa,
    titleNative: titleJa,
    cover: raw?.imageLarge ?? animekoCover(id, 'large'),
    coverThumb: raw?.imageThumb ?? animekoCover(id, 'thumb'),
    summary: typeof raw?.summary === 'string' ? raw.summary : '',
    score: Number.isFinite(score) && score > 0 ? Math.round(score * 10) / 10 : null,
    rank: Number.isFinite(raw?.rank) ? raw.rank : null,
    episodes,
    date,
    status,
    genres: tags.slice(0, 8),
    aliases: Array.isArray(raw?.aliases) ? raw.aliases.filter((value) => typeof value === 'string') : [],
    airingInfo: raw?.airingInfo ?? null,
    relations,
    siteUrl: id !== null ? `https://bgm.tv/subject/${id}` : null,
    source: 'animeko',
  }
}

/** AniList descriptions are HTML-ish even with `asHtml: false`. */
function stripHtml(value) {
  return typeof value === 'string'
    ? value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
    : ''
}

function normalizeAniListMedia(media) {
  const title = media?.title ?? {}
  // "斗罗大陆" is the show's real name; userPreferred only carries the
  // romanisation, so a Chinese native title wins over it.
  const chineseNative = isChineseTitle(title.native) && !isChineseTitle(title.userPreferred)
  return {
    id: `anilist-${media?.id ?? ''}`,
    anilistId: media?.id ?? null,
    title: chineseNative
      ? title.native
      : title.userPreferred || title.romaji || title.english || title.native || '',
    titleRomaji: title.romaji ?? '',
    titleNative: title.native ?? '',
    titleChinese: titleChineseFrom(title, media?.synonyms),
    titleEnglish: title.english ?? '',
    cover: media?.coverImage?.extraLarge ?? media?.coverImage?.large ?? media?.coverImage?.medium ?? null,
    banner: media?.bannerImage ?? null,
    accent: media?.coverImage?.color ?? null,
    summary: typeof media?.description === 'string' ? media.description : '',
    score: typeof media?.averageScore === 'number' ? media.averageScore : null,
    popularity: media?.popularity ?? null,
    episodes: media?.episodes ?? null,
    duration: media?.duration ?? null,
    status: media?.status ?? null,
    format: media?.format ?? null,
    season: media?.season ?? null,
    seasonYear: media?.seasonYear ?? null,
    genres: Array.isArray(media?.genres) ? media.genres : [],
    siteUrl: media?.siteUrl ?? null,
    synonyms: Array.isArray(media?.synonyms) ? media.synonyms.filter((value) => typeof value === 'string') : [],
    nextEpisode: media?.nextAiringEpisode
      ? {
          episode: media.nextAiringEpisode.episode,
          airingAt: media.nextAiringEpisode.airingAt,
          timeUntilAiring: media.nextAiringEpisode.timeUntilAiring,
        }
      : null,
    studios: Array.isArray(media?.studios?.nodes)
      ? media.studios.nodes.map((node) => node?.name).filter((name) => typeof name === 'string')
      : [],
    sourceLabel: typeof media?.source === 'string' ? media.source : null,
    trailer: media?.trailer?.id ? { id: media.trailer.id, site: media.trailer.site ?? null } : null,
    rank: Array.isArray(media?.rankings) && media.rankings.length > 0
      ? media.rankings.reduce((best, item) => {
          if (typeof item?.rank !== 'number') return best
          return best === null || item.rank < best.rank ? { rank: item.rank, type: item.type ?? '', year: item.year ?? null } : best
        }, null)
      : null,
    characters: Array.isArray(media?.characters?.edges)
      ? media.characters.edges
          .filter((edge) => edge?.node && edge.node.id)
          .map((edge) => ({
            id: edge.node.id,
            name: edge.node.name?.full ?? edge.node.name?.native ?? '',
            native: edge.node.name?.native ?? '',
            image: edge.node.image?.large ?? null,
            role: edge.role ?? '',
            gender: edge.node.gender ?? '',
            age: edge.node.age ?? '',
            bloodType: edge.node.bloodType ?? '',
            birth: edge.node.dateOfBirth
              ? [edge.node.dateOfBirth.year, edge.node.dateOfBirth.month, edge.node.dateOfBirth.day]
                  .filter((part) => typeof part === 'number')
                  .join('-')
              : '',
            description: stripHtml(edge.node.description ?? ''),
            voice: Array.isArray(edge.voiceActors) && edge.voiceActors[0]
              ? {
                  name: edge.voiceActors[0].name?.full ?? '',
                  image: edge.voiceActors[0].image?.large ?? null,
                }
              : null,
          }))
      : [],
    relations: Array.isArray(media?.relations?.edges)
      ? media.relations.edges
          .filter((edge) => edge?.node && edge.node.id)
          .map((edge) => ({
            id: edge.node.id,
            type: edge.node.type ?? 'ANIME',
            relation: edge.relationType ?? '',
            format: edge.node.format ?? '',
            status: edge.node.status ?? '',
            title: edge.node.title?.userPreferred || edge.node.title?.romaji || edge.node.title?.native || '',
            cover: edge.node.coverImage?.large ?? null,
            episodes: edge.node.episodes ?? null,
            year: edge.node.seasonYear ?? null,
          }))
      : [],
    source: 'anilist',
  }
}

// AniList has no Chinese title field and its 2026-season synonyms are mostly
// romanisations, so an AniList-only page reads as English. Animeko's schedule
// carries the Chinese aliases Bangumi knows, and its ids are Bangumi ids, so a
// season of AniList entries can be renamed from one extra request. Matching is
// exact after normalisation: a fuzzy hit once renamed "薬屋のひとりごと" to
// "BanG Dream! 第三季", which is worse than leaving the romanised title alone.
const CHINESE_TITLE_TTL = 6 * 60 * 60 * 1000
const chineseTitleCache = new Map()
const seasonIndexCache = new Map()

/** Lowercase, NFKC, letters/digits only: the two databases differ in spaces,
 * full-width punctuation and trailing marks, not in the words themselves. */
function normalizeTitleKey(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function hasSeasonMarker(text) {
  return /第\s*[一二三四五六七八九十0-9]+\s*[期季部]|season\s*[0-9]+|[0-9]+(st|nd|rd|th)\s*season/iu.test(String(text ?? ''))
}

/** @returns {Promise<Map<string, {title: string, bangumiId: number|null}>>} */
async function animekoSeasonIndex(season, year) {
  const seasonId = seasonIdOf(season, year)
  const cached = seasonIndexCache.get(seasonId)
  if (cached !== undefined && Date.now() - cached.at < CHINESE_TITLE_TTL) return cached.index
  const payload = await requestJson(`${ANIMEKO_ENDPOINT}/v1/schedule/season/${seasonId}`, {}, 12000)
  const index = new Map()
  for (const entry of Array.isArray(payload?.list) ? payload.list : []) {
    const chinese = pickChineseTitle(entry?.aliases, [])
    if (!isChineseTitle(chinese)) continue
    for (const name of [entry?.name, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]) {
      const key = normalizeTitleKey(name)
      if (key.length < 4 || index.has(key)) continue
      index.set(key, { title: chinese, bangumiId: entry?.bangumiId ?? null })
    }
  }
  seasonIndexCache.set(seasonId, { at: Date.now(), index })
  if (process.env.DSH_ANIME_DEBUG === '1') console.error(`[cn] index ${seasonId}: ${Array.isArray(payload?.list) ? payload.list.length : 'no-list'} entries -> ${index.size} keys`)
  return index
}

function applyIndexChinese(items, index) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0 || index.size === 0) return list
  for (const item of list) {
    if (item === null || item === undefined || isChineseTitle(item.title)) continue
    // A Chinese native title ("斗罗大陆", "罗小黑战记") is the real name of the
    // show: AniList only puts its romanisation in userPreferred.
    if (isChineseTitle(item.titleNative)) {
      item.titleCn = item.titleNative
      item.title = item.titleNative
      continue
    }
    for (const candidate of [item.titleNative, item.titleRomaji, item.titleOriginal, item.title]) {
      const key = normalizeTitleKey(candidate)
      if (key === '') continue
      const hit = index.get(key)
      if (hit === undefined) continue
      item.titleCn = hit.title
      item.title = hit.title
      if (Number.isFinite(hit.bangumiId)) item.bgmId = item.bgmId ?? hit.bangumiId
      break
    }
  }
  return list
}

/** Rename AniList/other entries from the Animeko schedule of the same season. */
async function applySeasonChinese(items, season, year) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0 || !SEASONS.has(String(season ?? '').toUpperCase())) return list
  let applied = list
  try {
    applied = applyIndexChinese(list, await animekoSeasonIndex(String(season).toUpperCase(), year))
  } catch {
    applied = list
  }
  // The schedule table only carries the names Animeko itself knows; a title it
  // spells differently (katakana noise, subtitles) is asked for directly. A few
  // at a time: this is the slow path and most entries never reach it.
  try {
    const stragglers = applied
      .filter((item) => item !== null && item !== undefined && !isChineseTitle(item.title))
      .slice(0, 6)
    await Promise.all(
      stragglers.map(async (item) => {
        const found = await lookupChineseTitle(item.titleNative || item.titleOriginal || item.title)
        if (found !== null) {
          item.titleCn = found
          item.title = found
        }
      }),
    )
  } catch {
    /* keep the names we have */
  }
  return applied
}

const airingIndexCache = new Map()

/** Same idea, one day at a time: Animeko's airing table names today's episodes. */
async function animekoAiringIndex(today, timeZone) {
  const cacheKey = `${today}:${timeZone}`
  const cached = airingIndexCache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at <= CHINESE_TITLE_TTL) return cached.index
  const payload = await requestJson(
    `${ANIMEKO_ENDPOINT}/v1/schedule/airing?today=${encodeURIComponent(today)}&timeZone=${encodeURIComponent(timeZone)}`,
    {},
    12000,
  )
  const index = new Map()
  for (const day of Array.isArray(payload?.list) ? payload.list : []) {
    for (const row of Array.isArray(day?.list) ? day.list : []) {
      const subject = row?.subject ?? {}
      const chinese = isChineseTitle(subject.nameCn) ? String(subject.nameCn).trim() : ''
      if (chinese === '') continue
      for (const name of [subject.name, subject.nameCn]) {
        const key = normalizeTitleKey(name)
        if (key.length < 4 || index.has(key)) continue
        index.set(key, { title: chinese, bangumiId: Number(subject.subjectId ?? 0) || null })
      }
    }
  }
  airingIndexCache.set(cacheKey, { at: Date.now(), index })
  return index
}

/** Single-title fallback for pages without a season to borrow from (search,
 * detail, the airing table). Only an exact name match is trusted. */
async function lookupChineseTitle(term) {
  const text = String(term ?? '').trim()
  const key = normalizeTitleKey(text)
  if (key === '') return null
  const cached = chineseTitleCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < CHINESE_TITLE_TTL) return cached.title
  let title = null
  try {
    const payload = await requestJson(
      `${ANIMEKO_ENDPOINT}/v2/subjects/search?q=${encodeURIComponent(text)}&limit=8`,
      {},
      6000,
    )
    const match = (Array.isArray(payload?.items) ? payload.items : []).find((entry) => {
      if (!isChineseTitle(entry?.nameCn)) return false
      const names = [entry.name, entry.nameCn, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]
      if (names.some((name) => normalizeTitleKey(name) === key)) return true
      // A name that only differs by its season marker ("第2期" vs "第2季")
      // still identifies the same show, as long as the base titles are equal.
      if (!hasSeasonMarker(text)) return false
      const base = normalizeTitleKey(text.replace(/第\s*[一二三四五六七八九十0-9]+\s*[期季部]/gu, '').replace(/season\s*[0-9]+/giu, ''))
      return base.length >= 4 && names.some((name) => normalizeTitleKey(name).startsWith(base))
    })
    title = match ? String(match.nameCn).trim() : null
  } catch {
    // A missing translation is cosmetic: the original title still works.
    title = null
  }
  chineseTitleCache.set(key, { at: Date.now(), title })
  return title
}

async function enrichChineseTitles(items, limit = 30) {
  const list = Array.isArray(items) ? items : []
  const targets = list.filter((item) => item && !isChineseTitle(item.title)).slice(0, Math.max(0, limit))
  if (targets.length === 0) return list
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const item = targets[cursor]
      cursor += 1
      // Japanese first: romanisations fuzzy-match onto unrelated shows.
      const terms = [item.titleNative, item.titleRomaji, item.title]
        .map((value) => String(value ?? '').trim())
        .filter((value) => value !== '')
      for (const term of terms) {
        const title = await lookupChineseTitle(term)
        if (title !== null) {
          item.titleCn = title
          item.title = title
          break
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, targets.length) }, worker))
  return list
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

function sendFailure(response, error, status = 200) {
  const code = error instanceof Error && typeof error.code === 'string' ? error.code : undefined
  const message = error instanceof Error ? error.message : String(error)
  // Media routes are consumed by <video>, so a pending torrent must fail fast with a
  // machine-readable status instead of holding the request open until it times out.
  if (code === 'metadata-pending') {
    sendJson(response, 409, { ok: false, error: { code, message, retryAfterMs: 3000 } })
    return
  }
  sendJson(response, status, { ok: false, error: code === undefined ? { message } : { code, message } })
}

/** Small JSON body reader for the few POST routes, bounded so it cannot be abused. */
/** The GET twin of a mutation body: ?payload=<json>, same shape as /action. */
function payloadFromQuery(request) {
  let url
  try {
    url = new URL(request.url ?? '/', 'http://dsh-anime.local')
  } catch {
    return {}
  }
  const raw = url.searchParams.get('payload') ?? ''
  if (raw.length > 1_500_000) throw new Error('请求体太大，改走 POST')
  if (raw === '') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new Error('payload 不是合法 JSON')
  }
}

function readJsonBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > limit) {
        reject(new Error('请求体过大'))
        request.destroy()
      }
    })
    request.on('end', () => {
      if (raw.trim() === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(new Error(`请求体不是合法 JSON：${error.message}`))
      }
    })
    request.on('error', reject)
  })
}

/** Lazily fetched once per session; refreshed on TTL expiry. */
function createSourceCatalogue() {
  const cache = createCache(6 * 60 * 60 * 1000)
  return async function load() {
    const hit = cache.get('catalogue')
    if (hit !== undefined) return hit
    const problems = []
    for (const url of SOURCE_CATALOGUE_URLS) {
      try {
        const entries = await requestJson(url, {}, 20000)
        if (!Array.isArray(entries)) throw new Error('catalogue is not an array')
        const providers = entries
          .filter((entry) => SOURCE_PROVIDER_TYPES.has(entry?.type))
          .map((entry) => ({
            id: entry.id,
            name: entry.name ?? entry.id,
            type: entry.type,
            kind: entry.type === 'onlinestream-provider' ? 'online' : 'torrent',
            author: entry.author ?? '',
            description: entry.description ?? '',
            lang: entry.lang ?? 'multi',
            icon: mirrorGitHubRaw(entry.icon ?? ''),
            manifestUri: mirrorGitHubRaw(entry.manifestURI ?? ''),
            payloadUri: mirrorGitHubRaw(entry.payloadURI ?? ''),
            website: entry.website ?? '',
            stars: entry.stars ?? null,
            updatedAt: entry.updatedAt ?? null,
            broken: entry.brokenTag === true,
            working: entry.workingTag !== false,
          }))
        return cache.set('catalogue', { providers, origin: url, total: entries.length })
      } catch (error) {
        problems.push(`${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    throw new Error(`source catalogue unreachable (${problems.join('; ')})`)
  }
}

// The bilibili client lives in lib/bilibili.js; the routes below only call it.

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
/** A native "pick a folder" dialog, host side. */
async function pickDirectory(startDir) {
  const start = String(startDir ?? '').trim()
  try {
    const electron = await import('electron')
    const dialog = electron?.dialog ?? electron?.default?.dialog
    if (dialog !== undefined && typeof dialog.showOpenDialog === 'function') {
      const result = await dialog.showOpenDialog({
        title: '选择下载目录',
        defaultPath: start === '' ? undefined : start,
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result?.canceled === true || (result?.filePaths ?? []).length === 0) return { cancelled: true }
      return { path: result.filePaths[0] }
    }
  } catch {
    /* not running inside Electron — fall through to the Windows dialog */
  }

  if (process.platform !== 'win32') return { cancelled: true, error: '这个平台没有内置的目录选择器，请直接填写路径' }

  const { spawn } = await import('node:child_process')
  const { writeFile, mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const folder = await mkdtemp(join(tmpdir(), 'dshan-pick-'))
  const script = join(folder, 'pick.ps1')
  const lines = [
    'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
    '$form = New-Object System.Windows.Forms.Form',
    '$form.TopMost = $true',
    '$form.ShowInTaskbar = $false',
    '$form.WindowState = "Minimized"',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = '选择下载目录'",
    '$dialog.ShowNewFolderButton = $true',
  ]
  if (start !== '') lines.push("$dialog.SelectedPath = '" + start.replace(/'/g, "''") + "'")
  lines.push(
    'if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::Out.Write($dialog.SelectedPath)',
    '}',
    '$form.Dispose()',
  )
  // Windows PowerShell 5.1 needs a BOM to read the Chinese description as UTF-8.
  await writeFile(script, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8')

  try {
    const output = await new Promise((resolve) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script], {
        windowsHide: true,
      })
      let out = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        out += chunk
      })
      const timer = setTimeout(() => child.kill(), 300000)
      child.on('close', () => {
        clearTimeout(timer)
        resolve(out.trim())
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve('')
      })
    })
    if (output === '') return { cancelled: true }
    return { path: output }
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Prove a resolved line actually carries bytes before a download commits to it.
 *
 * ffprobe only opens the URL: an HLS playlist that parses fine still hangs
 * forever on a segment host that is gone, and that is exactly how a download job
 * sat at "0 B / running" with no `.part` file on disk. So: read the URL, and if
 * it answers with a playlist, read the first segment too. Anything that cannot
 * hand over bytes inside `timeoutMs` is a dead line.
 */
async function sniffMedia(url, headers = {}, timeoutMs = 12000) {
  const read = async (target) => {
    const response = await fetch(target, { headers, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) throw new Error(`上游 ${response.status}`)
    const type = String(response.headers.get('content-type') ?? '')
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('上游没有响应体')
    let text = ''
    let bytes = 0
    while (bytes < 65536) {
      const chunk = await reader.read()
      if (chunk.done === true) break
      const value = chunk.value
      if (value === undefined) break
      bytes += value.length
      // A playlist is small; it has to be decoded to find the first segment.
      if (text.length < 262144) text += Buffer.from(value).toString('utf8')
    }
    void reader.cancel().catch(() => undefined)
    return { type, bytes, text }
  }
  const first = await read(url)
  const looksPlaylist = /mpegurl|vnd\.apple/i.test(first.type) || first.text.trimStart().startsWith('#EXTM3U')
  if (!looksPlaylist) return { kind: 'media', bytes: first.bytes, type: first.type }
  const media = first.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && line.startsWith('#') === false)
  if (media === undefined) throw new Error('播放列表里没有分片')
  const segment = new URL(media, url).toString()
  const second = await read(segment)
  if (second.bytes === 0) throw new Error('分片没有字节')
  return { kind: 'hls', bytes: second.bytes, type: second.type, playlist: url, segment }
}

export function apply(ctx) {
  /**
   * Watch a freshly started download until it has produced bytes, or give up.
   *
   * ffprobe and the actual remux disagree often enough on these lines that
   * "starts fine" means nothing: the first read is where a dead CDN shows up.
   */
  async function waitForFirstBytes(id, budgetMs) {
    if (id === '') return { ok: true, reason: '' }
    const deadline = Date.now() + budgetMs
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const job = downloadQueue.list().find((entry) => entry.id === id)
      if (job === undefined) return { ok: false, reason: '任务不见了' }
      if ((Number(job.received) || 0) > 0) return { ok: true, reason: '' }
      if (job.status === 'error') return { ok: false, reason: String(job.error ?? 'ffmpeg 报错') }
      if (job.status !== 'running' && job.status !== 'queued') return { ok: false, reason: `状态 ${job.status}` }
    }
    return { ok: false, reason: `${Math.round(budgetMs / 1000)} 秒没有数据` }
  }

  const shortCache = createCache(60 * 1000)
  const longCache = createCache(10 * 60 * 1000)
  const loadSources = createSourceCatalogue()
  accountStore = createAccountStore(STATE_DIR)
  /**
   * The page sees the providers the extensions declare, plus a masked status
   * per saved credential — never the secret, and never a provider list the
   * Host hardcodes.
   */
  const accountsView = () => ({
    providers: registry.accountProviders(),
    accounts: publicAccounts(accountStore.load()),
  })

  /**
   * OAuth logins in flight, keyed by the `state` we sent to the provider. The
   * page polls with that key; the callback route finishes the exchange and the
   * next poll sees it. Anything older than five minutes is forgotten.
   */
  const pendingLogins = new Map()

  function sweepPendingLogins() {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, entry] of pendingLogins) {
      if (entry.startedAt < cutoff) pendingLogins.delete(key)
    }
  }

  /**
   * Account login is entirely the extension's business: the Host only routes,
   * stores what a provider verified, and reports the masked result.
   */
  function qrProvider() {
    const found = registry.accountProviders().find((entry) => entry.kind === 'qr')
    return found === undefined ? '' : found.id
  }

  function accountProvider(requested) {
    const wanted = String(requested ?? '').trim() || qrProvider()
    if (wanted === '') throw new Error('没有任何扩展提供扫码登录')
    return registry.account(wanted)
  }

  async function saveAccount(provider, value) {
    const account = registry.account(provider)
    if (typeof account.verify !== 'function') throw new Error(`${account.label} 不支持粘贴登录`)
    const saved = await account.verify(value)
    accountStore.set(account.id, saved)
    return saved
  }

  /* -------------------------------------------------------------- bangumi */

  /**
   * The OAuth app is the user's own (Bangumi issues one per client) and the
   * code→token exchange needs the secret, so the Host does it. Both values may
   * be empty; every consumer below has to cope with that.
   */
  function bangumiClient() {
    const values = registry.values('bangumi')
    return {
      clientId: String(values?.clientId ?? '').trim(),
      clientSecret: String(values?.clientSecret ?? '').trim(),
    }
  }

  /** bgm.tv is blocked on some networks; the base is settable per extension. */
  function bangumiApplyBase() {
    let base = ''
    try {
      base = String(registry.values('bangumi')?.apiBase ?? '')
    } catch {
      base = ''
    }
    bgm.setApiBase(base)
  }

  /**
   * The base every Bangumi request should go to.
   *
   * `lib/bangumi.js` keeps its own copy (`bgm.setApiBase`), but calendar,
   * search and season are written here against the constant `BANGUMI_ENDPOINT`,
   * so setting a mirror used to change only half of the source: 详情能通、季度和
   * 搜索照样打被墙的原站。这条函数是唯一入口。
   */
  function bangumiEndpoint() {
    try {
      const base = String(registry.values('bangumi')?.apiBase ?? '').trim()
      if (base !== '') return base.replace(/\/+$/, '')
    } catch {
      /* registry not ready yet (early probe) — fall through to the default */
    }
    // 没填就是镜像：官方 api.bgm.tv 在这台机器上 TCP 全超时（.87 实测），
    // 填 https://api.bgm.tv 才是显式选官方。
    return BANGUMI_MIRROR
  }

  /** The loopback callback this exact request would come back to. */
  function bangumiRedirect(request) {
    const host = String(request?.headers?.host ?? '127.0.0.1')
    const forwarded = request?.headers?.['x-forwarded-proto']
    const proto = typeof forwarded === 'string' && forwarded !== '' ? forwarded.split(',')[0].trim() : 'http'
    return `${proto}://${host}${ROUTE_PREFIX}/bangumi/oauth/callback`
  }

  /**
   * A usable access token: rotated shortly before it expires, falling back to
   * the stored one when the rotation fails (a dead refresh token should not
   * take the whole page down).
   */
  async function bangumiToken() {
    bangumiApplyBase()
    const entry = accountStore.get('bangumi')
    if (entry === null || entry === undefined) throw new Error('还没有登录 Bangumi（设置 → 片源 → Bangumi）')
    const secret = String(entry.secret ?? '')
    const fields = entry.fields ?? {}
    const expiresAt = Number(fields.expiresAt) || 0
    const refresh = String(fields.refresh ?? '')
    const expiring = expiresAt > 0 && Date.now() > expiresAt - 60_000
    if (!expiring || refresh === '') return secret
    const { clientId, clientSecret } = bangumiClient()
    if (clientId === '' || clientSecret === '') return secret
    try {
      const rotated = await bgm.refreshTokens({ clientId, clientSecret, refreshToken: refresh })
      accountStore.set('bangumi', {
        secret: rotated.access,
        fields: { ...fields, refresh: rotated.refresh, expiresAt: rotated.expiresAt },
        savedAt: Date.now(),
      })
      return rotated.access
    } catch (error) {
      console.warn('[dsh-anime] bangumi refresh failed', error?.message ?? error)
      return secret
    }
  }

  async function bangumiSubject(id) {
    bangumiApplyBase()
    return bgm.subject(id)
  }

  async function bangumiEpisodes(id) {
    bangumiApplyBase()
    return bgm.episodes(id)
  }

  async function bangumiCollections({ type = 3, limit = 24, offset = 0 } = {}) {
    bangumiApplyBase()
    return bgm.collections(await bangumiToken(), { type, limit, offset })
  }

  async function bangumiCollectionFor(id) {
    bangumiApplyBase()
    return bgm.collectionFor(await bangumiToken(), id)
  }

  async function bangumiMarkEpisodes(id, episodes, type) {
    bangumiApplyBase()
    return bgm.markEpisodes(await bangumiToken(), id, episodes, type)
  }

  async function bangumiSetCollection(id, type) {
    bangumiApplyBase()
    return bgm.setCollection(await bangumiToken(), id, type)
  }

  function bangumiAuthorize(redirectUri, state) {
    const { clientId } = bangumiClient()
    return { url: bgm.authorizeUrl({ clientId, redirectUri, state }), state: String(state ?? '') }
  }

  /**
   * Settings are one JSON file. They are read once into this cache and rewritten
   * on save; every route reads the cache so a page can never see two shapes.
   */
  let settingsState = null
  function settingsSync() {
    if (settingsState === null) {
      try {
        settingsState = coerceSettings(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')))
      } catch {
        settingsState = coerceSettings({})
      }
    }
    return settingsState
  }

  /** Downloads need resolved paths synchronously, so they read the same cache. */
  const downloadQueue = createDownloads({
    getSettings: () => {
      const current = settingsSync()
      return {
        ...resolvePaths(current),
        keepHistory: current.downloads.keepHistory,
        copyTorrents: current.downloads.copyTorrents,
      }
    },
    getTorrents: () => torrents(),
  })

  /** Everything the settings page shows about the machine it runs on. */
  async function settingsView() {
    const current = settingsSync()
    return {
      settings: publicSettings(current),
      defaults: publicSettings(DEFAULT_SETTINGS),
      paths: resolvePaths(current),
      players: await detectPlayers(),
      ffmpeg: await findFfmpeg(),
    }
  }

  /** The engine reads caches and config at build time, so a change rebuilds it. */
  let torrentOptions = null
  function engineKey(options) {
    return JSON.stringify({ kind: options.kind, cacheDir: options.cacheDir })
  }

  const bili = createBilibili({
    routePrefix: ROUTE_PREFIX,
    accountCookie: () => ACCOUNT.bilibili,
    combineCookie,
    mixinKey,
    signQuery,
    resolvePath,
    createTranscodeStream,
  })
  /** Episode URLs expire, so they are held for five minutes only. */
  // bilibili signs DASH urls with a `deadline`: once it passes, ffmpeg gets
  // 403. Keep them only briefly so a retry re-signs instead of replaying stale.
  const playUrlCache = createCache(90 * 1000)
  /** Torrent engine is heavy to build (it loads webtorrent), so it starts on demand. */
  let torrentService = null
  function torrents() {
    const options = engineOptions(settingsSync())
    const key = engineKey(options)
    if (torrentService === null || torrentOptions !== key) {
      torrentOptions = key
      torrentService = createTorrentService(options)
    }
    return torrentService
  }

  /**
   * bilibili signs every DASH url with a `deadline` (epoch seconds). BiliPai
   * caches a resolved play url until `min(maxAge, deadline - 30s)` instead of a
   * fixed TTL, which is exactly the "403 after a while" we kept hitting. Keep the
   * same rule here: remember when the url dies and drop it before that.
   */
  const playUrlDeadlines = new Map()
  function deadlineOf(payload) {
    const urls = [payload?.videoUrl, payload?.url, payload?.audioUrl].filter((item) => typeof item === 'string')
    let soonest = null
    for (const url of urls) {
      const match = /[?&]deadline=(\d+)/.exec(url)
      if (match === null) continue
      const at = Number(match[1]) * 1000
      if (!Number.isFinite(at) || at <= 0) continue
      soonest = soonest === null ? at : Math.min(soonest, at)
    }
    return soonest === null ? null : soonest - 30 * 1000
  }

  async function cachedPlay(key, load, fresh) {
    const dead = playUrlDeadlines.get(key)
    if (fresh || (dead !== null && dead !== undefined && Date.now() > dead)) {
      playUrlCache.delete(key)
      playUrlDeadlines.delete(key)
    }
    const hit = playUrlCache.get(key)
    if (hit !== undefined) return hit
    const value = await load()
    const expiresAt = deadlineOf(value)
    if (expiresAt !== null) playUrlDeadlines.set(key, expiresAt)
    return playUrlCache.set(key, value)
  }

  async function resolvePlay(epId, cid, qn, fresh = false) {
    const key = `play:${epId}:${cid}:${qn}`
    return cachedPlay(key, () => registry.call('bilibili', 'resolvePlay', { epId, cid, qn }), fresh)
  }

  /** Same deal for user uploads, keyed by bvid + part. */
  async function resolveVideoPlay(bvid, cid, qn, fresh = false) {
    const key = `vplay:${bvid}:${cid}:${qn}`
    return cachedPlay(key, () => registry.call('bilibili', 'resolvePlay', { bvid, cid, qn }), fresh)
  }

  /** Probe result for the header badge; cached so opening the page is cheap. */
  let bangumiProbe = { at: 0, ok: false, message: '' }
  let animekoProbe = { at: 0, ok: false, message: '' }
  async function bangumiCalendar() {
    const hit = shortCache.get(`bgm:calendar@${bangumiEndpoint()}`)
    if (hit !== undefined) return hit
    // The mirror is slow on a cold calendar (measured 19s once); official bgm.tv
    // answers in ~1s when it answers at all. 45s covers the mirror without
    // turning a hung network into an infinite spinner.
    const days = await requestJson(`${bangumiEndpoint()}/calendar`, {}, 45000)
    if (!Array.isArray(days)) throw new Error('Bangumi returned an unexpected calendar shape')
    const normalized = days.map((day) => ({
      weekday: {
        id: day?.weekday?.id ?? null,
        cn: day?.weekday?.cn ?? '',
        ja: day?.weekday?.ja ?? '',
        en: day?.weekday?.en ?? '',
      },
      items: Array.isArray(day?.items) ? day.items.map(normalizeBangumiSubject) : [],
    }))
    bangumiProbe = { at: Date.now(), ok: true, message: '' }
    return shortCache.set(`bgm:calendar@${bangumiEndpoint()}`, normalized)
  }

  async function guarded(sourceName, load) {    try {
      const data = await load()
      if (sourceName === 'bangumi') bangumiProbe = { at: Date.now(), ok: true, message: '' }
      if (sourceName === 'animeko') animekoProbe = { at: Date.now(), ok: true, message: '' }
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (sourceName === 'bangumi') bangumiProbe = { at: Date.now(), ok: false, message }
      if (sourceName === 'animeko') animekoProbe = { at: Date.now(), ok: false, message }
      return { ok: false, error: { message, source: sourceName } }
    }
  }

  /** Resolved play URLs for generic online sources, so a seek does not re-scrape. */
  const resolvedStreams = new Map()

  /**
   * Which online extension is being asked for. A source has to exist, be of
   * type `online`, and be switched on — otherwise the request is a mistake we
   * should say out loud instead of failing somewhere deeper.
   */
  function onlineSource(requested) {
    const wanted = String(requested ?? '').trim()
    const list = registry.ofType('online').map(({ manifest }) => manifest)
    if (wanted === '') {
      const first = list.find((manifest) => registry.enabledOf(manifest) !== false)
      if (first === undefined) throw new Error('没有任何在线片源，先到「片源」里打开一个')
      return first.id
    }
    const manifest = list.find((entry) => entry.id === wanted)
    if (manifest === undefined) throw new Error(`未知的在线片源: ${wanted}`)
    if (registry.enabledOf(manifest) === false) throw new Error(`${manifest.name} 已停用，先在「片源」里打开`)
    return manifest.id
  }

  /**
   * A resolve result comes in two shapes: our own flat `{ url, type, headers }`
   * and the Seanime one, which returns every quality at once as
   * `videoSources[{ url, type, quality, label, subtitles }]`. Normalise both so
   * the page sees one list of tracks and never has to know which it got.
   */
  function resolvedTracks(resolved, quality = '') {
    const headers = resolved?.headers ?? {}
    const sources = Array.isArray(resolved?.videoSources)
      ? resolved.videoSources.filter((entry) => entry !== null && typeof entry?.url === 'string' && entry.url !== '')
      : []
    const tracks =
      sources.length > 0
        ? sources.map((entry, index) => ({
            url: entry.url,
            type: typeof entry.type === 'string' ? entry.type : 'unknown',
            quality: String(entry.quality ?? '') || `q${index + 1}`,
            label: String(entry.label ?? ''),
            subtitles: Array.isArray(entry.subtitles) ? entry.subtitles : [],
          }))
        : typeof resolved?.url === 'string' && resolved.url !== ''
          ? [
              {
                url: resolved.url,
                type: typeof resolved?.type === 'string' ? resolved.type : 'unknown',
                quality: String(resolved?.quality ?? '') || 'auto',
                label: String(resolved?.label ?? ''),
                subtitles: Array.isArray(resolved?.subtitles) ? resolved.subtitles : [],
              },
            ]
          : []
    const wanted = String(quality ?? '').trim()
    const chosen = wanted === '' ? tracks[0] : tracks.find((track) => track.quality === wanted) ?? tracks[0]
    return { headers, tracks, chosen }
  }

  /**
   * The resolve of one episode, remembered for ten minutes so a seek — which
   * re-opens the stream with `?start=` — does not scrape the site again.
   */
  async function resolveOnline(source, episode, server, dub = false) {
    const key = `online:resolve:${source}:${episode}:${server}:${dub ? 'dub' : 'org'}`
    const hit = resolvedStreams.get(key)
    if (hit !== undefined && Date.now() - hit.at < 10 * 60 * 1000) return hit.value
    const value = await registry.call(source, 'resolve', { episodeId: episode, server, dub })
    resolvedStreams.set(key, { at: Date.now(), value })
    return value
  }

  async function fetchText(target, headers) {
    const response = await fetch(target, { headers })
    if (!response.ok) throw new Error(`片源返回 HTTP ${response.status}`)
    return (await response.text()).trim()
  }

  /**
   * The first kilobyte of a stream, without downloading it.
   *
   * Needed because a line typed `auto` can turn out to be a 600 MB mp4: pulling
   * the whole body only to discover it is not a playlist is not acceptable on a
   * route the player calls for every episode.
   */
  async function fetchHead(target, headers, bytes = 2048) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(target, {
        headers: { ...headers, range: `bytes=0-${bytes - 1}` },
        signal: controller.signal,
      })
      if (response.ok === false && response.status !== 206) throw new Error(`片源返回 HTTP ${response.status}`)
      const reader = response.body?.getReader()
      if (reader === undefined) return ''
      let text = ''
      while (text.length < bytes) {
        const chunk = await reader.read()
        if (chunk.done === true) break
        if (chunk.value !== undefined) text += Buffer.from(chunk.value).toString('latin1')
      }
      await reader.cancel().catch(() => undefined)
      return text
    } finally {
      clearTimeout(timer)
    }
  }

  function sumExtinf(playlist) {
    let total = 0
    for (const match of String(playlist ?? '').matchAll(/#EXTINF:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
      const seconds = Number(match[1])
      if (Number.isFinite(seconds) && seconds > 0) total += seconds
    }
    return total
  }

  /** First variant of a master playlist, resolved against the master's URL. */
  function firstVariant(playlist, base) {
    const lines = String(playlist ?? '').split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (line.startsWith('#EXT-X-STREAM-INF') === false) continue
      for (let next = index + 1; next < lines.length; next += 1) {
        const uri = lines[next].trim()
        if (uri === '' || uri.startsWith('#')) continue
        try {
          return new URL(uri, base).toString()
        } catch {
          return ''
        }
      }
    }
    return ''
  }

  /**
   * How long the media actually is, for streams whose container does not say.
   *
   * An HLS playlist carries the length as the sum of its #EXTINF tags — the
   * transcode we hand Chromium does not, which is why the timeline used to be
   * stuck on "--:--". A master playlist points at one variant, so follow it
   * once. Anything else returns 0, and the player keeps whatever its own
   * demuxer found (a plain mp4 knows its own length).
   */
  async function measureMediaSeconds(resolved, quality = '') {
    const { headers, chosen } = resolvedTracks(resolved, quality)
    const target = String(chosen?.url ?? '')
    if (target === '') return 0
    // The first bytes decide, and they are cheap: a declared `m3u8` can be a
    // master playlist and a declared `auto` is usually a whole film.
    const head = await fetchHead(target, headers).catch(() => '')
    const playlist = head.startsWith('#EXTM3U') || (head === '' && chosen.type === 'm3u8')
    if (playlist) {
      const text = await fetchText(target, headers)
      if (text.startsWith('#EXTM3U') === false) return 0
      if (text.includes('#EXT-X-STREAM-INF')) {
        const variant = firstVariant(text, target)
        return variant === '' ? 0 : sumExtinf(await fetchText(variant, headers))
      }
      return sumExtinf(text)
    }
    // Not a playlist: the container itself knows, and ffprobe reads the moov
    // atom without downloading the file. 0 means it really has no length.
    return probeDurationSeconds(target, { headers })
  }

  const handlers = {
    /**
     * The page says which client build it is running, so "the change did not
     * take effect" becomes a log fact instead of a guess.
     */
    async 'client/heartbeat'(_request, url) {
      const build = String(url.searchParams.get('build') ?? 'unknown')
      CLIENT_BUILD_SEEN.at = Date.now()
      CLIENT_BUILD_SEEN.build = build
      console.info(`[dsh-anime] client build ${build} (host ${PLUGIN_BUILD})`)
      return { seen: CLIENT_BUILD_SEEN, host: PLUGIN_BUILD }
    },

    async settings() {
      return settingsView()
    },

    async downloads() {
      const paths = resolvePaths(settingsSync())
      await downloadQueue.ensureLoaded()
      return { jobs: downloadQueue.list(), stats: downloadQueue.stats(), dir: paths.downloadDir }
    },

    async health(request, url) {
      const season = seasonOf(new Date())
      // The page can be served from dsh-app://… in the desktop shell, where a
      // relative /dsh-anime/api url is not something mpv can open. The real
      // server origin only exists here, in the request, so hand it back.
      const hostHeader = String(request?.headers?.host ?? '').trim()
      const forwarded = String(request?.headers?.['x-forwarded-proto'] ?? '').trim()
      const proto = forwarded !== '' ? forwarded : request?.socket?.encrypted === true ? 'https' : 'http'
      const origin = hostHeader === '' ? null : `${proto}://${hostHeader}`
      return {
        ok: true,
        data: {
          version: PLUGIN_VERSION,
          build: PLUGIN_BUILD,
          origin,
          now: Date.now(),
          season,
          sources: {
            anilist: { label: 'AniList', endpoint: ANILIST_ENDPOINT },
            bangumi: {
              label: 'Bangumi 番组计划',
              endpoint: bangumiEndpoint(),
              lastProbe: bangumiProbe,
            },
            animeko: {
              label: 'Animeko',
              endpoint: ANIMEKO_ENDPOINT,
              lastProbe: animekoProbe,
            },
            bilibili: {
              label: '哔哩哔哩',
              endpoint: BILIBILI_API,
              playable: true,
            },
          },
          catalogue: { types: [...SOURCE_PROVIDER_TYPES] },
          since: url.searchParams.get('since') ?? null,
        },
      }
    },

    async 'anilist/season'(_request, url) {
      const fallback = seasonOf(new Date())
      const rawSeason = String(url.searchParams.get('season') ?? fallback.season).toUpperCase()
      const season = SEASONS.has(rawSeason) ? rawSeason : fallback.season
      const year = clampInt(url.searchParams.get('year'), fallback.year, 1940, 2100)
      const page = clampInt(url.searchParams.get('page'), 1, 1, 50)
      const perPage = clampInt(url.searchParams.get('perPage'), 30, 1, 50)
      const sortKey = String(url.searchParams.get('sort') ?? 'popular')
      const sort = SORTS[sortKey.toUpperCase()] ?? SORTS[sortKey] ?? SORTS.popular
      return guarded('anilist', async () => {
        const key = `season:${season}:${year}:${page}:${perPage}:${sort}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const data = await anilist(QUERY_SEASON, {
          season,
          year,
          page,
          perPage,
          sort: [sort],
        })
        const items = await applySeasonChinese((data?.Page?.media ?? []).map(normalizeAniListMedia), season, year)
        const result = {
          season,
          year,
          page,
          hasNextPage: data?.Page?.pageInfo?.hasNextPage === true,
          total: data?.Page?.pageInfo?.total ?? null,
          items,
        }
        return longCache.set(key, result)
      })
    },

    async 'anilist/trending'(_request, url) {
      const page = clampInt(url.searchParams.get('page'), 1, 1, 50)
      const perPage = clampInt(url.searchParams.get('perPage'), 30, 1, 50)
      return guarded('anilist', async () => {
        const key = `trending:${page}:${perPage}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const data = await anilist(QUERY_TRENDING, { page, perPage })
        const result = {
          page,
          hasNextPage: data?.Page?.pageInfo?.hasNextPage === true,
          items: await applySeasonChinese((data?.Page?.media ?? []).map(normalizeAniListMedia), seasonOf(new Date()).season, seasonOf(new Date()).year),
        }
        return longCache.set(key, result)
      })
    },

    async 'anilist/search'(_request, url) {
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, data: { items: [], term: '' } }
      const page = clampInt(url.searchParams.get('page'), 1, 1, 20)
      return guarded('anilist', async () => {
        const key = `search:${term.toLowerCase()}:${page}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const data = await anilist(QUERY_SEARCH, { search: term, page, perPage: 30 })
        const result = {
          term,
          page,
          hasNextPage: data?.Page?.pageInfo?.hasNextPage === true,
          items: await applySeasonChinese((data?.Page?.media ?? []).map(normalizeAniListMedia), seasonOf(new Date()).season, seasonOf(new Date()).year),
        }
        return longCache.set(key, result)
      })
    },

    /**
     * Browse with facets. Every parameter is optional: a missing one is left
     * out of the GraphQL variables so AniList applies no constraint, and an
     * unrecognised enum is dropped too — sending `format: "TVX"` would come
     * back as a 400 with a GraphQL error rather than an empty page.
     */
    async 'anilist/browse'(_request, url) {
      const param = (name) => String(url.searchParams.get(name) ?? '').trim()
      const upper = (name, allowed) => {
        const value = param(name).toUpperCase()
        return allowed.has(value) ? value : ''
      }
      const term = param('q')
      const genre = param('genre').slice(0, 40)
      const tag = param('tag').slice(0, 40)
      const format = upper('format', BROWSE_FORMATS)
      const season = upper('season', BROWSE_SEASONS)
      const status = upper('status', BROWSE_STATUSES)
      const sortValue = upper('sort', BROWSE_SORTS)
      const yearRaw = param('year')
      const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : 0
      const scoreRaw = param('score')
      const score = /^\d{1,3}$/.test(scoreRaw) ? Math.min(100, Math.max(0, Number(scoreRaw))) : 0
      const adult = param('adult') === '1'
      const page = clampInt(url.searchParams.get('page'), 1, 1, 50)
      const perPage = clampInt(url.searchParams.get('perPage'), 30, 6, 50)

      // `search` implies relevance sorting; an explicit sort wins when given.
      const sort = sortValue !== '' ? [sortValue] : term !== '' ? ['SEARCH_MATCH'] : ['POPULARITY_DESC']

      const variables = { page, perPage, sort, adult }
      if (term !== '') variables.search = term
      if (genre !== '') variables.genre = genre
      if (tag !== '') variables.tag = tag
      if (format !== '') variables.format = format
      if (season !== '') variables.season = season
      if (year > 0) variables.year = year
      if (status !== '') variables.status = status
      if (score > 0) variables.score = score

      return guarded('anilist', async () => {
        const key = `browse:${JSON.stringify(variables)}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const data = await anilist(QUERY_BROWSE, variables)
        const now = seasonOf(new Date())
        const result = {
          page,
          total: Number(data?.Page?.pageInfo?.total) || 0,
          hasNextPage: data?.Page?.pageInfo?.hasNextPage === true,
          filters: {
            q: term,
            genre,
            tag,
            format,
            season,
            year: year > 0 ? year : 0,
            status,
            score,
            adult,
            sort: sort[0],
          },
          items: await applySeasonChinese(
            (data?.Page?.media ?? []).map(normalizeAniListMedia),
            now.season,
            now.year,
          ),
        }
        return longCache.set(key, result)
      })
    },

    async 'anilist/airing'(_request, url) {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const from = clampInt(url.searchParams.get('from'), nowSeconds - 12 * 3600, 0, Number.MAX_SAFE_INTEGER)
      const to = clampInt(url.searchParams.get('to'), from + 7 * 24 * 3600, from + 60, Number.MAX_SAFE_INTEGER)
      return guarded('anilist', async () => {
        const key = `airing:${from}:${to}`
        const hit = shortCache.get(key)
        if (hit !== undefined) return hit
        const collected = []
        let page = 1
        // A week of anime can exceed one page; two is enough for the UI and
        // keeps a cold load snappy.
        while (page <= 2) {
          const data = await anilist(QUERY_AIRING, { from, to, page, perPage: 50 })
          const schedules = data?.Page?.airingSchedules ?? []
          for (const schedule of schedules) {
            const media = schedule?.media
            if (!media || media.isAdult === true) continue
            const title = media.title ?? {}
            collected.push({
              id: schedule.id,
              airingAt: schedule.airingAt,
              episode: schedule.episode,
              mediaId: media.id,
              title: title.userPreferred || title.romaji || title.english || title.native || '',
              titleOriginal: title.userPreferred || title.romaji || title.native || '',
              titleNative: title.native || '',
              titleRomaji: title.romaji || '',
              cover: media.coverImage?.large ?? media.coverImage?.medium ?? null,
              accent: media.coverImage?.color ?? null,
              episodes: media.episodes ?? null,
              score: media.averageScore ?? null,
              siteUrl: media.siteUrl ?? null,
            })
          }
          if (data?.Page?.pageInfo?.hasNextPage !== true) break
          page += 1
        }
        collected.sort((a, b) => a.airingAt - b.airingAt)
        // Two indexes, one round trip each: fetch together, apply in order.
        const currentSeason = seasonOf(new Date())
        const localToday = new Date().toISOString().slice(0, 10)
        const [seasonIndex, airingIndex] = await Promise.all([
          animekoSeasonIndex(currentSeason.season, currentSeason.year).catch(() => new Map()),
          animekoAiringIndex(localToday, 'Asia/Shanghai').catch(() => new Map()),
        ])
        applyIndexChinese(collected, seasonIndex)
        applyIndexChinese(collected, airingIndex)
        return shortCache.set(key, { from, to, items: collected })
      })
    },

    async 'anilist/media'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, Number.MAX_SAFE_INTEGER)
      if (id <= 0) return { ok: false, error: { message: 'a numeric AniList id is required' } }
      return guarded('anilist', async () => {
        const key = `media:${id}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const data = await anilist(QUERY_MEDIA, { id })
        if (!data?.Media) throw new Error(`AniList has no anime with id ${id}`)
        const media = normalizeAniListMedia(data.Media)
        if (media.season !== null && typeof media.seasonYear === 'number') {
          await applySeasonChinese([media], media.season, media.seasonYear)
        }
        // One title, so a single search is affordable here: a franchise page
        // is where an English title is most annoying.
        await enrichChineseTitles([media], 1)
        // The relations strip is the way to walk a franchise, so give it the
        // same Chinese titles the grid uses.
        if (Array.isArray(media.relations) && media.relations.length > 0) {
          await enrichChineseTitles(media.relations, 10)
        }
        return longCache.set(key, media)
      })
    },

    // The watch order plugin everyone installs in Seanime does one thing: walk
    // PREQUEL/SEQUEL from whatever page you are on until the franchise runs
    // out, then print the chain in order. AniList already carries those edges
    // on every media, so this needs no third party service.
    async 'anilist/watchorder'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, Number.MAX_SAFE_INTEGER)
      if (id <= 0) return { ok: false, error: { message: 'a numeric AniList id is required' } }
      return guarded('anilist', async () => {
        const key = `watchorder:${id}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit

        const node = (media, relation) => ({
          id: media.id,
          relation,
          title: media.title?.userPreferred ?? media.title?.romaji ?? media.title?.native ?? `#${media.id}`,
          format: media.format ?? null,
          episodes: typeof media.episodes === 'number' ? media.episodes : null,
          status: media.status ?? null,
          year: typeof media.seasonYear === 'number' ? media.seasonYear : null,
          cover: media.coverImage?.large ?? null,
        })

        const fetched = new Map()
        const load = async (mediaId) => {
          if (fetched.has(mediaId)) return fetched.get(mediaId)
          const data = await anilist(QUERY_WATCH_LINK, { id: mediaId })
          const media = data?.Media
          if (!media) throw new Error(`AniList has no anime with id ${mediaId}`)
          fetched.set(mediaId, media)
          return media
        }
        const edgesOf = (media) => (Array.isArray(media.relations?.edges) ? media.relations.edges : [])
        const pick = (media, relationType) => {
          const hitEdge = edgesOf(media).find((edge) => edge?.relationType === relationType && edge?.node?.type === 'ANIME')
          return hitEdge?.node ?? null
        }

        // Walk backwards to the oldest prequel, then forwards through every
        // sequel. Both directions are capped so a looping relation graph (a
        // spin-off chain that points back) cannot spin forever.
        const before = []
        let cursor = await load(id)
        for (let guard = 0; guard < 8; guard += 1) {
          const prequel = pick(cursor, 'PREQUEL')
          if (prequel === null) break
          before.unshift(node(prequel, 'PREQUEL'))
          cursor = await load(prequel.id)
        }
        const after = []
        cursor = await load(id)
        for (let guard = 0; guard < 12; guard += 1) {
          const sequel = pick(cursor, 'SEQUEL')
          if (sequel === null) break
          after.push(node(sequel, 'SEQUEL'))
          cursor = await load(sequel.id)
        }

        const root = await load(id)
        const items = [...before, node(root, 'CURRENT'), ...after]
        const titles = items.map((item) => ({ title: item.title }))
        await enrichChineseTitles(titles, items.length)
        for (let index = 0; index < items.length; index += 1) {
          const chinese = String(titles[index]?.title ?? '').trim()
          if (chinese !== '' && chinese !== items[index].title) items[index].titleZh = chinese
        }

        return longCache.set(key, { items, position: before.length })
      })
    },

    // animethemes.moe keys its database by AniList id, so the themes for any
    // page come straight from one GET. A theme's entry videos are the official
    // OP/ED clips (webm/mp4); the audio-only variants are not offered here.
    async 'animethemes/themes'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, Number.MAX_SAFE_INTEGER)
      if (id <= 0) return { ok: false, error: { message: 'a numeric AniList id is required' } }
      return guarded('anilist', async () => {
        const key = `themes:${id}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        // The API validates these as arrays (a scalar comes back as
        // "The filter.resource must be an array"), so every filter value is
        // written with the [] suffix Laravel expects.
        const endpoint =
          'https://api.animethemes.moe/anime' +
          '?filter[has][]=resources&filter[resource][]=AniList' +
          `&filter[external_id][]=${id}` +
          '&include=animethemes.song,animethemes.animethemeentries.videos'
        // One attempt, ten seconds, no requestJson: requestJson retries a
        // dropped connection once, which turned a blocked host into a 24 s
        // wait before the tab could say anything.
        let payload = null
        try {
          const response = await fetch(endpoint, {
            headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
            signal: AbortSignal.timeout(25000),
          })
          if (!response.ok) {
            const body = (await response.text()).slice(0, 200).replace(/\s+/g, ' ')
            throw new Error(`api.animethemes.moe responded ${response.status}：${body}`)
          }
          payload = await response.json()
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`animethemes.moe 取不到主题曲（${reason}）`)
        }
        const anime = Array.isArray(payload?.anime) ? payload.anime[0] : null
        const themes = []
        for (const theme of Array.isArray(anime?.animethemes) ? anime.animethemes : []) {
          const type = String(theme.type ?? '').toUpperCase()
          if (type !== 'OP' && type !== 'ED') continue
          const entries = Array.isArray(theme.animethemetheentries) ? theme.animethemetheentries : []
          const entry = entries.find((candidate) => Array.isArray(candidate?.videos) && candidate.videos.length > 0)
          const video = Array.isArray(entry?.videos) ? entry.videos[0] : null
          if (!video?.link) continue
          themes.push({
            type,
            sequence: typeof theme.sequence === 'number' ? theme.sequence : null,
            slug: theme.slug ?? '',
            title: theme.song?.title ?? '',
            artists: Array.isArray(theme.song?.artists)
              ? theme.song.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
              : '',
            video: video.link,
            mimetype: video.mimetype ?? 'video/webm',
            resolution: typeof video.resolution === 'number' ? video.resolution : null,
            episodes: entry?.episodes ?? '',
          })
        }
        themes.sort((left, right) => {
          if (left.type !== right.type) return left.type === 'OP' ? -1 : 1
          return (left.sequence ?? 0) - (right.sequence ?? 0)
        })
        return longCache.set(key, { anime: anime?.name ?? '', themes })
      })
    },

    async 'bangumi/calendar'() {
      return guarded('bangumi', async () => {
        const days = await bangumiCalendar()
        return { days }
      })
    },

    async 'bangumi/subject'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, 10_000_000)
      if (id <= 0) return { ok: false, error: { message: 'id 无效' } }
      return guarded('bangumi', async () => {
        const key = `bgm:subject:${id}@${bangumiEndpoint()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, await bangumiSubject(id))
      })
    },

    async 'bangumi/episodes'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, 10_000_000)
      if (id <= 0) return { ok: false, error: { message: 'id 无效' } }
      return guarded('bangumi', async () => {
        const key = `bgm:episodes:${id}@${bangumiEndpoint()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, { items: await bangumiEpisodes(id) })
      })
    },

    async 'bangumi/collections'(_request, url) {
      const type = clampInt(url.searchParams.get('type'), 3, 1, 5)
      const limit = clampInt(url.searchParams.get('limit'), 24, 1, 50)
      const offset = clampInt(url.searchParams.get('offset'), 0, 0, 5000)
      return guarded('bangumi', async () => bangumiCollections({ type, limit, offset }))
    },

    async 'bangumi/collection'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, 10_000_000)
      if (id <= 0) return { ok: false, error: { message: 'id 无效' } }
      return guarded('bangumi', async () => bangumiCollectionFor(id))
    },

    async 'bangumi/mark'(body) {
      const id = clampInt(body?.id, 0, 0, 10_000_000)
      const type = clampInt(body?.type, 2, 0, 2)
      const episodes = Array.isArray(body?.episodes) ? body.episodes : [body?.episode]
      if (id <= 0) return { ok: false, error: { message: 'id 无效' } }
      return guarded('bangumi', async () => bangumiMarkEpisodes(id, episodes, type))
    },

    async 'bangumi/set-collection'(body) {
      const id = clampInt(body?.id, 0, 0, 10_000_000)
      const type = clampInt(body?.type, 3, 1, 5)
      if (id <= 0) return { ok: false, error: { message: 'id 无效' } }
      return guarded('bangumi', async () => bangumiSetCollection(id, type))
    },

    async 'bangumi/search'(_request, url) {
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, data: { term: '', items: [] } }
      return guarded('bangumi', async () => {
        const key = `bgm:search:${term.toLowerCase()}@${bangumiEndpoint()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const payload = await requestJson(
          `${bangumiEndpoint()}/v0/search/subjects?limit=24`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keyword: term, filter: { type: [2] } }),
          },
          15000,
        )
        const result = {
          term,
          items: (payload?.data ?? []).map(normalizeBangumiSubject),
        }
        bangumiProbe = { at: Date.now(), ok: true, message: '' }
        return longCache.set(key, result)
      })
    },

    async 'bangumi/season'(_request, url) {
      const fallback = seasonOf(new Date())
      const rawSeason = String(url.searchParams.get('season') ?? fallback.season).toUpperCase()
      const season = SEASONS.has(rawSeason) ? rawSeason : fallback.season
      const year = clampInt(url.searchParams.get('year'), fallback.year, 1940, 2100)
      return guarded('bangumi', async () => {
        const key = `bgm:season:${season}:${year}@${bangumiEndpoint()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const payload = await requestJson(
          `${bangumiEndpoint()}/v0/search/subjects?limit=30`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sort: 'rank', filter: { type: [2], air_date: bangumiSeasonRange(season, year) } }),
          },
          15000,
        )
        const items = (payload?.data ?? []).map(normalizeBangumiSubject)
        bangumiProbe = { at: Date.now(), ok: true, message: '' }
        return longCache.set(key, { season, year, items })
      })
    },

    async 'anich/season'(_request, url) {
      const fallback = seasonOf(new Date())
      const rawSeason = String(url.searchParams.get('season') ?? fallback.season).toUpperCase()
      const season = SEASONS.has(rawSeason) ? rawSeason : fallback.season
      const year = clampInt(url.searchParams.get('year'), fallback.year, 1940, 2100)
      return guarded('anich-data', async () => {
        const key = `anich:season:${season}:${year}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const result = await registry.call('anich-data', 'season', { season, year })
        return longCache.set(key, { season, year, items: result?.items ?? [] })
      })
    },

    async 'anich/search'(_request, url) {
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, data: { items: [] } }
      return guarded('anich-data', async () => {
        const key = `anich:search:${term.toLowerCase()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const result = await registry.call('anich-data', 'search', { term })
        return longCache.set(key, { items: result?.items ?? [] })
      })
    },

    async 'anich/detail'(_request, url) {
      const id = String(url.searchParams.get('id') ?? '').replace(/[^0-9]/g, '')
      if (id === '') return { ok: false, error: { message: '缺少 id' } }
      return guarded('anich-data', () => registry.call('anich-data', 'detail', { id }))
    },

    async 'anich/episodes'(_request, url) {
      const id = String(url.searchParams.get('id') ?? '').replace(/[^0-9]/g, '')
      if (id === '') return { ok: false, error: { message: '缺少 id' } }
      return guarded('anich-data', () => registry.call('anich-data', 'episodes', { id }))
    },

    async 'animeko/season'(_request, url) {
      const fallback = seasonOf(new Date())
      const rawSeason = String(url.searchParams.get('season') ?? fallback.season).toUpperCase()
      const season = SEASONS.has(rawSeason) ? rawSeason : fallback.season
      const year = clampInt(url.searchParams.get('year'), fallback.year, 1940, 2100)
      const rawSeasonId = String(url.searchParams.get('seasonId') ?? '')
      const seasonId = /^\d{4}q[1-4]$/.test(rawSeasonId) ? rawSeasonId : seasonIdOf(season, year)
      const sortKey = String(url.searchParams.get('sort') ?? 'popular').toLowerCase()
      return guarded('animeko', async () => {
        const key = `ani:season:${seasonId}:${sortKey}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const payload = await requestJson(`${ANIMEKO_ENDPOINT}/v1/schedule/season/${seasonId}`, {}, 15000)
        const list = Array.isArray(payload?.list) ? payload.list : []
        const items = list.map(normalizeAnimekoSubject)
        // A few entries carry no Chinese alias at all while their subject record
        // still has one ("暗机 DARK MACHINE"), so fill those in — bounded, in
        // parallel, and only for the ones that came back without Chinese.
        const missing = items.filter((item) => !hasChinese(item.title) && Number.isFinite(item.animekoId)).slice(0, 12)
        if (missing.length > 0) {
          await Promise.all(
            missing.map(async (item) => {
              try {
                const detail = await requestJson(`${ANIMEKO_ENDPOINT}/v2/subjects/${item.animekoId}`, {}, 8000)
                if (hasChinese(detail?.nameCn)) item.title = detail.nameCn
              } catch {
                // A missing Chinese name is not worth failing the whole list for.
              }
            }),
          )
        }
        // The schedule only promises names and a begin date, so the toolbar's
        // sort is applied here rather than upstream.
        if (sortKey === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        else if (sortKey === 'newest') items.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
        else items.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
        return longCache.set(key, { seasonId, season, year, items })
      })
    },

    async 'animeko/search'(_request, url) {
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, data: { term: '', items: [] } }
      const limit = clampInt(url.searchParams.get('limit'), 24, 1, 50)
      return guarded('animeko', async () => {
        const key = `ani:search:${term.toLowerCase()}:${limit}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        // `q` is required by this endpoint: an empty one is rejected upstream.
        const payload = await requestJson(
          `${ANIMEKO_ENDPOINT}/v2/subjects/search?q=${encodeURIComponent(term)}&limit=${limit}`,
          {},
          15000,
        )
        const items = (payload?.items ?? []).map(normalizeAnimekoSubject)
        return longCache.set(key, { term, items })
      })
    },

    async 'animeko/subject'(_request, url) {
      const id = clampInt(url.searchParams.get('id'), 0, 0, Number.MAX_SAFE_INTEGER)
      if (id <= 0) return { ok: false, error: { message: '需要一个 Animeko 条目 id' } }
      return guarded('animeko', async () => {
        const key = `ani:subject:${id}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const payload = await requestJson(`${ANIMEKO_ENDPOINT}/v2/subjects/${id}`, {}, 15000)
        if (payload?.id === undefined) throw new Error(`Animeko 没有 id ${id} 的条目`)
        return longCache.set(key, normalizeAnimekoSubject(payload))
      })
    },

    async 'animeko/airing'(_request, url) {
      const rawToday = String(url.searchParams.get('today') ?? '')
      const today = /^\d{4}-\d{2}-\d{2}$/.test(rawToday) ? rawToday : new Date().toISOString().slice(0, 10)
      const timeZone = String(url.searchParams.get('tz') ?? 'Asia/Shanghai')
      return guarded('animeko', async () => {
        const key = `ani:airing:${today}:${timeZone}`
        const hit = shortCache.get(key)
        if (hit !== undefined) return hit
        const payload = await requestJson(
          `${ANIMEKO_ENDPOINT}/v1/schedule/airing?today=${today}&timeZone=${encodeURIComponent(timeZone)}`,
          {},
          15000,
        )
        const items = []
        for (const day of payload?.list ?? []) {
          for (const entry of day?.list ?? []) {
            const subject = entry?.subject ?? {}
            const airingMs = Date.parse(entry?.airingTime ?? '')
            if (!Number.isFinite(airingMs)) continue
            const subjectId = Number(subject.subjectId ?? 0) || null
            const episode = Number.parseInt(String(entry?.episode?.ep ?? ''), 10)
            items.push({
              id: `${subjectId ?? 'x'}-${entry?.episode?.episodeId ?? ''}`,
              airingAt: Math.floor(airingMs / 1000),
              episode: Number.isFinite(episode) ? episode : null,
              mediaId: subjectId,
              title: subject.nameCn || subject.name || '',
              titleOriginal: subject.name ?? '',
              cover: subject.imageLarge ?? animekoCover(subjectId, 'thumb'),
              episodes: null,
              score: null,
              siteUrl: subjectId !== null ? `https://bgm.tv/subject/${subjectId}` : null,
              source: 'animeko',
            })
          }
        }
        items.sort((a, b) => a.airingAt - b.airingAt)
        return shortCache.set(key, { today, timeZone, items })
      })
    },

    /**
     * Generic online surface: every `online` extension that implements the
     * contract (search / episodes / servers / resolve) is driven from here, so
     * the page never grows a branch per site and a new source is a manifest.
     */
    async 'online/sources'() {
      // `ofType` hands back extension entries, not manifests.
      const items = registry.ofType('online').map(({ manifest, handlers }) => ({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description ?? '',
        lang: manifest.lang ?? '',
        icon: manifest.icon ?? '',
        website: manifest.website ?? '',
        enabled: registry.enabledOf(manifest) !== false,
        server:
          typeof registry.values(manifest.id).server === 'string' ? registry.values(manifest.id).server : '',
        // A source only offers a dub switch when it says it can serve one.
        dub: manifest.dub === true || typeof handlers?.dub === 'function',
      }))
      return { items }
    },

    async 'online/search'(_request, url) {
      const source = onlineSource(url.searchParams.get('source'))
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, source, term: '', items: [] }
      return guarded(source, async () => {
        const key = `online:search:${source}:${term.toLowerCase()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const items = await registry.call(source, 'search', { term })
        return longCache.set(key, { ok: true, source, term, items: Array.isArray(items) ? items : [] })
      })
    },

    async 'online/browse'(_request, url) {
      const source = onlineSource(url.searchParams.get('source'))
      const page = clampInt(url.searchParams.get('page'), 1, 1, 60)
      return guarded(source, async () => {
        const key = `online:browse:${source}:${page}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const items = await registry.call(source, 'browse', { page, limit: 24 })
        return longCache.set(key, { ok: true, source, page, items: Array.isArray(items) ? items : [] })
      })
    },

    async 'online/episodes'(_request, url) {
      const source = onlineSource(url.searchParams.get('source'))
      const id = String(url.searchParams.get('id') ?? '').trim()
      const server = String(url.searchParams.get('server') ?? '').trim()
      if (id === '') return { ok: true, source, items: [] }
      return guarded(source, async () => {
        // The line is part of the cache key: two lines of the same anime have
        // different episode lists (and different sids).
        const key = `online:episodes:${source}:${id}:${server}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        const items = await registry.call(source, 'episodes', server === '' ? { id } : { id, server })
        return longCache.set(key, { ok: true, source, id, server, items: Array.isArray(items) ? items : [] })
      })
    },

    async 'online/duration'(_request, url) {
      const source = onlineSource(url.searchParams.get('source'))
      const episode = String(url.searchParams.get('episode') ?? '').trim()
      const server = String(url.searchParams.get('server') ?? '').trim()
      if (episode === '') return { ok: true, source, seconds: 0 }
      return guarded(source, async () => {
        // A live transcode has no duration in its container, so the page asks
        // here and shows a real total instead of "--:--".
        const key = `online:duration:${source}:${episode}:${server}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        // A source that knows the length answers first; when it does not, the
        // media itself is measured (the playlist's #EXTINF sum). Both paths are
        // allowed to fail without failing the page: 0 means "unknown", which is
        // exactly what the player already handles.
        let seconds = 0
        try {
          seconds = Number(await registry.call(source, 'duration', { episodeId: episode, server })) || 0
        } catch {
          seconds = 0
        }
        if (seconds <= 0) {
          try {
            seconds = await measureMediaSeconds(await resolveOnline(source, episode, server, false))
          } catch (error) {
            console.warn(`[dsh-anime] online duration probe failed source=${source}: ${String(error?.message ?? error)}`)
            seconds = 0
          }
        }
        return longCache.set(key, { ok: true, source, seconds: Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0 })
      })
    },

    async 'online/servers'(_request, url) {
      const source = onlineSource(url.searchParams.get('source'))
      const id = String(url.searchParams.get('id') ?? '').trim()
      const episode = String(url.searchParams.get('episode') ?? '').trim()
      return guarded(source, async () => {
        // With an id this is the line list of that one anime; without one it is
        // the site-wide list a manifest can offer as a default.
        //
        // The episode rides along because a line list can belong to a single
        // episode — AniCh keeps its lines per episode, captions and all. Asked
        // without one, a source answers for the first episode, which is what the
        // page needs the moment an anime is opened.
        const args = id === '' ? {} : episode === '' ? { id } : { id, episode }
        const items = await registry.call(source, 'servers', args)
        return {
          ok: true,
          source,
          id,
          episode,
          items: Array.isArray(items) ? items.map((item) => (typeof item === 'string' ? { name: item } : item)) : [],
        }
      })
    },

    /**
     * Playback for a generic online source.
     *
     * These sites hand out m3u8, which no Chromium can play natively, so the
     * Host resolves the real URL (with the Referer the CDN demands) and pipes it
     * through ffmpeg as fragmented MP4 — the same shape the player already
     * knows. `?start=` becomes an input seek, so seeking stays one request.
     */
    /**
     * Covers live on whatever CDN the source feels like using that day. Passing
     * them through the Host keeps the page free of third-party referer rules and
     * gives us one place to cache them.
     */
    // online/cover is a raw route below (images cannot be JSON).
    async 'bili/search'(_request, url) {
      const term = String(url.searchParams.get('q') ?? '').trim()
      if (term === '') return { ok: true, data: { term: '', items: [] } }
      return guarded('bilibili', async () => {
        const key = `bili:search:${term.toLowerCase()}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, { term, items: await registry.call('bilibili', 'search', { term }) })
      })
    },

    async 'bili/videos'(_request, url) {
      const term = String(url.searchParams.get('keyword') ?? url.searchParams.get('q') ?? '').trim()
      const page = clampInt(url.searchParams.get('page'), 1, 1, 30)
      if (term === '') return { ok: true, data: { term: '', page, total: 0, items: [] } }
      return guarded('bilibili', async () => {
        const key = `bili:videos:${term.toLowerCase()}:${page}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, await registry.call('bilibili', 'videos', { term, page }))
      })
    },

    async 'bili/video'(_request, url) {
      const bvid = String(url.searchParams.get('bvid') ?? '').trim()
      if (!/^BV[0-9A-Za-z]+$/.test(bvid)) {
        return { ok: false, error: { message: 'a bvid looks like BV1xx411c7mD' } }
      }
      return guarded('bilibili', async () => {
        const key = `bili:video:${bvid}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, await registry.call('bilibili', 'video', { bvid }))
      })
    },

    async 'bili/season'(_request, url) {
      const seasonId = clampInt(url.searchParams.get('season_id'), 0, 0, Number.MAX_SAFE_INTEGER)
      if (seasonId <= 0) return { ok: false, error: { message: 'a numeric season_id is required' } }
      return guarded('bilibili', async () => {
        const key = `bili:season:${seasonId}`
        const hit = longCache.get(key)
        if (hit !== undefined) return hit
        return longCache.set(key, await registry.call('bilibili', 'season', { seasonId }))
      })
    },

    /**
     * Chapters for the scrub bar. Two different worlds behind one route:
     *
     * - uploads (`?bvid=&cid=`) carry `view_points` on the **player** payload.
     *   `x/web-interface/view` has no such field at all, which is why the bar
     *   used to stay plain for every upload.
     * - PGC episodes (`?ep_id=` / `?season_id=`) only publish the OP/ED skip
     *   window, on the season payload (`episodes[].skip.op/ed`, seconds). The
     *   player APIs return an empty `view_points` for them and the playurl
     *   response has no chapter field at all.
     *
     * Nothing invented: an episode without chapter data returns an empty list
     * and the bar stays plain, which is what the data says.
     */
    async 'bili/chapters'(_request, url) {
      const bvid = String(url.searchParams.get('bvid') ?? '').trim()
      const cid = clampInt(url.searchParams.get('cid'), 0, 0, Number.MAX_SAFE_INTEGER)
      const epId = clampInt(url.searchParams.get('ep_id'), 0, 0, Number.MAX_SAFE_INTEGER)
      const seasonId = clampInt(url.searchParams.get('season_id'), 0, 0, Number.MAX_SAFE_INTEGER)
      const isUpload = /^BV[0-9A-Za-z]{10}$/.test(bvid)
      if (epId <= 0 && seasonId <= 0 && !isUpload) return { ok: true, chapters: [] }
      const key = `chapters:${epId}:${seasonId}:${bvid}:${cid}`
      const hit = longCache.get(key)
      if (hit !== undefined) return hit
      try {
        return longCache.set(key, { ok: true, chapters: await registry.call('bilibili', 'chapters', { epId, seasonId, bvid, cid }) })
      } catch (error) {
        console.warn(`[dsh-anime] bili chapters failed: ${String(error?.message ?? error)}`)
        return { ok: true, chapters: [] }
      }
    },

    async 'bili/episode'(_request, url) {
      const epId = clampInt(url.searchParams.get('ep_id'), 0, 0, Number.MAX_SAFE_INTEGER)
      const cid = clampInt(url.searchParams.get('cid'), 0, 0, Number.MAX_SAFE_INTEGER)
      const qn = clampInt(url.searchParams.get('qn'), biliQuality(), 16, 120)
      if (epId <= 0 || cid <= 0) {
        return { ok: false, error: { message: 'ep_id and cid are required' } }
      }
      return guarded('bilibili', async () => {
        const play = await resolvePlay(epId, cid, qn)
        return {
          quality: play.quality,
          size: play.size,
          kind: play.kind,
          formats: play.formats,
          src: `${ROUTE_PREFIX}/bili/stream?ep_id=${epId}&cid=${cid}&qn=${qn}`,
        }
      })
    },

    async sources(_request, url) {
      const kind = String(url.searchParams.get('kind') ?? 'all')
      return guarded('catalogue', async () => {
        const catalogue = await loadSources()
        const providers = kind === 'all'
          ? catalogue.providers
          : catalogue.providers.filter((provider) => provider.kind === kind)
        return {
          origin: catalogue.origin,
          total: catalogue.total,
          counts: {
            online: catalogue.providers.filter((provider) => provider.kind === 'online').length,
            torrent: catalogue.providers.filter((provider) => provider.kind === 'torrent').length,
          },
          providers,
        }
      })
    },

    async 'sources/manifest'(_request, url) {
      const uri = String(url.searchParams.get('uri') ?? '')
      // Only GitHub raw is mirrored: anything else would make this an open
      // proxy, and the catalogue only ever points at GitHub.
      if (!/^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net)\//.test(uri)) {
        return { ok: false, error: { message: 'only GitHub-hosted provider manifests may be fetched' } }
      }
      const target = uri.includes('raw.githubusercontent.com') ? mirrorGitHubRaw(uri) : uri
      return guarded('catalogue', async () => {
        const hit = longCache.get(`manifest:${target}`)
        if (hit !== undefined) return hit
        const manifest = await requestJson(target, {}, 15000)
        return longCache.set(`manifest:${target}`, {
          uri: target,
          originalUri: uri,
          manifest,
        })
      })
    },

    async 'torrent/search'(_request, url) {
      const query = String(url.searchParams.get('q') ?? '').trim()
      const provider = String(url.searchParams.get('provider') ?? 'anibt').trim().toLowerCase()
      const titles = String(url.searchParams.get('titles') ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
      if (query === '' && titles.length === 0) return { ok: false, error: { message: '请输入要搜索的番剧名' } }
      const options = {
        query,
        titles,
        episode: clampInt(url.searchParams.get('episode'), 0, 0, 5000),
        resolution: String(url.searchParams.get('resolution') ?? ''),
        batch: String(url.searchParams.get('batch') ?? ''),
        page: clampInt(url.searchParams.get('page'), 1, 1, 5),
      }

      // Which torrent extensions answer, in the order the caller asked for.
      const enabled = registry.list().filter((item) => item.type === 'torrent' && item.enabled)
      if (enabled.length === 0) {
        return { ok: false, error: { message: '所有种子源都关掉了，先到「片源」里打开一个' } }
      }
      const order =
        provider === 'animetosho' || provider === 'anibt'
          ? [provider]
          : enabled.map((item) => item.id)

      const { results, notes } = await registry.searchAll('torrent', 'search', options)
      const wanted = results.filter((entry) => order.includes(entry.id))
      const scanned = wanted.reduce((total, entry) => total + entry.items.length, 0)
      if (provider === 'all' || provider === 'every') {
        return {
          provider: 'all',
          scanned,
          notes,
          items: wanted.flatMap((entry) =>
            entry.items.map((item) => ({ ...item, provider: entry.name, providerId: entry.id })),
          ),
        }
      }
      const primary = wanted.find((entry) => entry.items.length > 0)
      if (primary === undefined) {
        return { provider: order[0] ?? '', scanned, notes: notes.length > 0 ? notes : ['没有找到种子'], items: [] }
      }
      return { provider: primary.id, providerName: primary.name, scanned, notes, items: primary.items }
    },

    async 'extensions/source'(request, url) {
      const id = String(url.searchParams.get('id') ?? '').trim()
      const listed = SOURCE_FILES[id]
      if (listed === undefined) return { ok: false, error: { message: `没有找到 ${id} 的源码` } }
      const entry = registry.list().find((item) => item.id === id)
      const files = listed.map((relative) => {
        const absolute = resolvePath(PLUGIN_DIR, relative)
        if (!absolute.startsWith(PLUGIN_DIR)) throw new Error('refusing to read outside the plugin')
        const text = readFileSync(absolute, 'utf8')
        const truncated = text.length > SOURCE_MAX_BYTES
        return {
          path: relative,
          name: relative.split('/').pop(),
          bytes: Buffer.byteLength(text, 'utf8'),
          lines: text.split('\n').length,
          truncated,
          backups: listBackups(absolute),
            content: truncated ? text.slice(0, SOURCE_MAX_BYTES) : text,
          }
      })
      return { ok: true, id, name: entry === undefined ? id : entry.name, files }
    },

    async extensions() {
      return { items: registry.list(), types: EXTENSION_TYPES, typeLabels: TYPE_LABELS }
    },

    async accounts() {
      return accountsView()
    },

    async 'stream/cache'() {
      const stats = await bili.muxCacheStats()
      return { ok: true, ...stats, running: bili.dashCount() }
    },

    /**
     * Drop every merged DASH file. Unfinished files (`.part`) and files a live
     * stream is still growing are skipped, so clearing while something plays
     * cannot break the running ffmpeg; those land again on the next pass.
     */
    async 'stream/cache/clear'() {
      const result = await bili.clearMuxCache()
      const stats = await bili.muxCacheStats()
      console.info(
        `[dsh-anime] mux cache cleared files=${result.removed} bytes=${result.bytes} skipped=${result.skipped}`,
      )
      return { ok: true, removed: result.removed, bytes: result.bytes, skipped: result.skipped, cache: stats }
    },
    async 'accounts/qr/status'(_request, url) {
      const key = String(url.searchParams.get('key') ?? '').trim()
      if (key === '') return { ok: false, error: { message: '缺少 qrcode_key' } }
      /**
       * OAuth polls by `state`: the callback route already saved the credential,
       * so this only reports whether a fresh record landed.
       */
      const pending = pendingLogins.get(key)
      if (pending !== undefined) {
        const saved = accountStore.get(pending.provider)
        const fresh =
          saved !== null &&
          saved !== undefined &&
          Number(saved.savedAt ?? 0) >= pending.startedAt &&
          (saved.fields?.kind ?? '') === 'oauth'
        if (!fresh) return { state: 'waiting', message: '等你在浏览器里完成授权…' }
        pendingLogins.delete(key)
        return {
          state: 'ok',
          provider: pending.provider,
          message: '已登录',
          accounts: { [pending.provider]: publicAccounts(accountStore.load())[pending.provider] ?? null },
          name: saved.fields?.name ?? '',
        }
      }
      const account = accountProvider(url.searchParams.get('provider'))
      if (typeof account.poll !== 'function') {
        return { state: 'waiting', message: `${account.label} 不支持扫码登录` }
      }
      const result = await account.poll(key)
      if (result.state !== 'ok') return { state: result.state, message: result.message }
      const saved = await saveAccount(account.id, result.cookie)
      return {
        state: 'ok',
        provider: account.id,
        message: result.message,
        accounts: { [account.id]: publicAccounts(accountStore.load())[account.id] ?? null },
        name: saved?.fields?.name ?? '',
      }
    },

    async 'torrent/status'() {
      return guarded('torrent', async () => (await torrents()).status())
    },

    async 'torrent/list'() {
      return guarded('torrent', async () => (await torrents()).list())
    },

    async 'torrent/files'(_request, url) {
      const hash = String(url.searchParams.get('hash') ?? '').trim()
      if (!/^[0-9a-fA-F]{40}$/.test(hash)) return { ok: false, error: { message: 'hash 无效' } }
      return guarded('torrent', async () => (await torrents()).files(hash))
    },
  }

  /**
   * Every source the page can switch on or configure is an extension: the
   * sources page renders manifests, and the preferences dialog is generated from
   * the same schema, so nothing in the UI is hard-coded per source.
   */
  const registry = createExtensionRegistry({
    // settingsSync() 而不是 settingsState：后者在插件刚重载、还没人读过设置时是 null，
    // 回落到 DEFAULT_SETTINGS 会让「默认关闭」的源全部显示关闭——存着的开关就白存了。
    getSettings: () => settingsSync(),
    saveSettingsPatch: async (patch) => {
      settingsState = await saveSettings(patch)
    },
  })

  registry.register({
    manifest: {
      id: 'anilist',
      name: 'AniList',
      type: 'data',
      version: '1.0.0',
      author: 'AniList',
      lang: 'en',
      description: '季度新番、放送表、搜索、角色与关联的主数据源。',
      account: { provider: 'anilist', kind: 'token' },
      settings: [],
    },
    account: anilistAccount,
  })

  registry.register({
    manifest: {
      id: 'bangumi',
      name: 'Bangumi',
      type: 'data',
      defaultEnabled: false,
      version: '1.0.1',
      author: 'Bangumi',
      lang: 'zh',
      description: '中文番组数据；访问不了 bgm.tv 时自动降级。',
      website: 'https://bgm.tv',
      account: { provider: 'bangumi', kind: 'oauth' },
      // The OAuth app belongs to the user: Bangumi issues one per client, and
      // the code→token exchange needs the secret, so both live here and the
      // exchange happens in the Host (see bangumi/oauth/callback).
      settings: [
        {
          key: 'clientId',
          kind: 'text',
          default: '',
          placeholder: 'App ID',
          label: 'OAuth App ID',
          labelEn: 'OAuth App ID',
          hint: '在 bgm.tv/dev/app 建一个应用，回调地址填本机地址（见「Bangumi 偏好」里的说明）。',
          hintEn: 'Create an app at bgm.tv/dev/app and use the loopback callback shown here.',
        },
        {
          key: 'clientSecret',
          kind: 'text',
          default: '',
          placeholder: 'App Secret',
          label: 'OAuth App Secret',
          labelEn: 'OAuth App Secret',
          hint: '只存在本机设置文件里，用来在宿主端换 access_token。',
          hintEn: 'Stored locally; used by the Host to exchange the code for a token.',
        },
        {
          key: 'preferChinese',
          kind: 'switch',
          default: true,
          label: '优先中文标题',
          labelEn: 'Prefer Chinese titles',
        },
        {
          key: 'apiBase',
          kind: 'text',
          // 官方 api.bgm.tv 在这台机器上 TCP 全超时（.87 实测），而 anibt 镜像
          // 的 /calendar、/v0/subjects、/v0/episodes、/v0/search/subjects 都 200。
          // 清空这个框就回到官方地址。
          default: 'https://bgmapi.anibt.net',
          placeholder: 'https://api.bgm.tv',
          label: 'API 地址',
          labelEn: 'API base',
          hint: '默认用通得上的镜像 https://bgmapi.anibt.net；清空则回官方 https://api.bgm.tv（本机访问不到）。',
          hintEn: 'Defaults to the reachable mirror https://bgmapi.anibt.net; clear it to use the official https://api.bgm.tv (unreachable here).',
        },
      ],
    },
    handlers: {
      subject: async ({ id }) => bangumiSubject(id),
      episodes: async ({ id }) => bangumiEpisodes(id),
      collections: async ({ type, limit, offset }) => bangumiCollections({ type, limit, offset }),
      collection: async ({ id }) => bangumiCollectionFor(id),
      mark: async ({ id, episodes, type }) => bangumiMarkEpisodes(id, episodes, type),
      setCollection: async ({ id, type }) => bangumiSetCollection(id, type),
      authorize: async ({ redirectUri, state }) => bangumiAuthorize(redirectUri, state),
    },
    account: bangumiAccount,
  })

  registry.register({
    manifest: {
      id: 'animeko',
      name: 'Animeko',
      type: 'data',
      defaultEnabled: false,
      version: '1.0.0',
      author: 'Animeko',
      lang: 'zh',
      description: '中文条目与放送表补充数据。',
      settings: [],
    },
  })

  registry.register({
    manifest: {
      id: 'anibt',
      name: 'AniBT',
      type: 'torrent',
      defaultEnabled: false,
      version: '1.0.0',
      author: 'Elisoar',
      lang: 'multi',
      description: '中文字幕组的种子，默认种子源。',
      settings: [
        { key: 'limit', kind: 'number', min: 6, max: 60, default: 24, label: '结果上限', labelEn: 'Result limit' },
        { key: 'includeBatches', kind: 'switch', default: true, label: '包含合集', labelEn: 'Include batches' },
      ],
    },
    handlers: {
      search: async ({ query, titles, episode, resolution, batch }, settings) => {
        const found = await searchAniBT({ query, bangumiTitles: titles, episode, resolution, batch })
        const items = Array.isArray(found.items) ? found.items : []
        const filtered = settings.includeBatches === false ? items.filter((item) => item.batch !== true) : items
        return { ...found, items: filtered.slice(0, settings.limit) }
      },
    },
  })

  registry.register({
    manifest: {
      id: 'animetosho',
      name: 'AnimeTosho',
      type: 'torrent',
      defaultEnabled: false,
      version: '1.0.0',
      author: 'AnimeTosho',
      lang: 'en',
      description: '英文圈的种子聚合站，AniBT 的兜底片源。',
      settings: [
        { key: 'limit', kind: 'number', min: 6, max: 60, default: 24, label: '结果上限', labelEn: 'Result limit' },
        { key: 'sortBySeeders', kind: 'switch', default: true, label: '按做种数排序', labelEn: 'Sort by seeders' },
      ],
    },
    handlers: {
      search: async ({ query, episode, resolution, batch, page }, settings) => {
        const found = await searchAnimeTosho({ query, episode, resolution, batch, page: page ?? 1 })
        const items = Array.isArray(found.items) ? [...found.items] : []
        if (settings.sortBySeeders !== false) items.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))
        return { ...found, items: items.slice(0, settings.limit) }
      },
    },
  })

  registry.register({
    manifest: {
      id: 'bilibili',
      name: '哔哩哔哩',
      type: 'online',
      defaultEnabled: false,
      version: '1.0.0',
      author: 'Bilibili',
      lang: 'zh',
      description: '番剧与用户投稿；扫码登录后能拿到更高码率。',
      website: 'https://www.bilibili.com',
      account: { provider: 'bilibili', kind: 'qr' },
      // Buttons this source contributes to the page. `open` just means "send the
      // user to my own site" — the player and everything else stay the page's.
      actions: [
        {
          id: 'site',
          kind: 'open',
          url: 'https://www.bilibili.com',
          icon: 'external',
          label: '打开哔哩哔哩',
          labelEn: 'Open bilibili',
          hint: '在浏览器里打开站点，方便登录、看历史或手动找片。',
        },
        {
          id: 'history',
          kind: 'open',
          url: 'https://www.bilibili.com/account/history',
          icon: 'external',
          label: '观看历史',
          labelEn: 'Watch history',
        },
      ],
      settings: [
        {
          key: 'quality',
          kind: 'choice',
          default: 80,
          label: '默认清晰度',
          labelEn: 'Default quality',
          options: [
            { value: 120, label: '4K', labelEn: '4K' },
            { value: 80, label: '1080P+', labelEn: '1080P+' },
            { value: 64, label: '720P', labelEn: '720P' },
            { value: 32, label: '480P', labelEn: '480P' },
            { value: 16, label: '360P', labelEn: '360P' },
          ],
          hint: '没有会员时服务端会自动回落到你能看的最高一档。',
          hintEn: 'Without membership the server falls back to the best you can play.',
        },
        { key: 'preferUploads', kind: 'switch', default: false, label: '默认看用户投稿', labelEn: 'Start on uploads' },
      ],
    },
    /**
     * The online source owns its own calls: search, the episode list, chapters
     * and the playurl resolution. The host keeps the HTTP surface, the caches
     * and the byte streaming; disabling the extension in 片源 turns all of it
     * off at once, with the same message the user sees there.
     */
    handlers: {
      search: async ({ term }) => bili.search(term),
      videos: async ({ term, page }) => bili.searchVideos(term, page ?? 1),
      video: async ({ bvid }) => bili.video(bvid),
      season: async ({ seasonId }) => bili.season(seasonId),
      chapters: async ({ epId = 0, seasonId = 0, bvid = '', cid = 0 }) => bili.chapters({ epId, seasonId, bvid, cid }),
      resolvePlay: async ({ epId = 0, bvid = '', cid = 0, qn = 80 }) =>
        epId > 0 ? bili.playurl(epId, cid, qn) : bili.playVideo(bvid, cid, qn),
    },
    /** The QR login is bilibili's own; the registry hands it to the settings page. */
    account: bilibiliAccount,
  })

  /**
   * FQDM — a MacCMS site with Chinese-subbed anime and donghua. It speaks the
   * generic online contract (search / episodes / servers / resolve), which is
   * what makes one page able to drive every third-party online source.
   */
  const fqdmServerOptions = fqdmServers().map((name) => ({ value: name, label: name, labelEn: name }))
  registry.register({
    manifest: {
      id: 'fqdm',
      name: 'FQDM',
      type: 'online',
      defaultEnabled: false,
      version: '1.0.1',
      author: 'Elisoar',
      lang: 'zh',
      description: '中文熟肉动画与国漫；只有中文搜索。播放地址走 m3u8，由宿主转成分片 MP4。',
      icon: 'https://raw.githubusercontent.com/Elisoar111/seanime-extensions/main/fqdm/icon.png',
      website: 'https://www.fqdm.cc',
      timeoutMs: 30000,
      // FQDM ships no dub track (its Seanime manifest says supportsDub: false).
      dub: false,
      actions: [
        {
          id: 'site',
          kind: 'open',
          url: 'https://www.fqdm.cc',
          icon: 'external',
          label: '打开 FQDM',
          labelEn: 'Open FQDM',
          hint: '站点上能直接看更新表和线路健康度，找片更快。',
        },
        {
          id: 'latest',
          kind: 'open',
          url: 'https://www.fqdm.cc/index.php/vod/show/id/1.html',
          icon: 'external',
          label: '最新更新',
          labelEn: 'Latest updates',
        },
      ],
      settings: [
        {
          key: 'server',
          kind: 'choice',
          default: fqdmServers()[0],
          label: '默认线路',
          labelEn: 'Default server',
          options: fqdmServerOptions,
          hint: '这条线路没有这一集时，播放页可以临时切别的。',
          hintEn: 'If this server lacks the episode, switch it on the play page.',
        },
        { key: 'preferChinese', kind: 'switch', default: true, label: '只搜中文标题', labelEn: 'Chinese titles only' },
      ],
    },
    handlers: {
      search: async ({ term }) => fqdmExtension.search(term),
      browse: async ({ page, limit }) => fqdmExtension.browse({ page, limit }),
      episodes: async ({ id, server }) => fqdmExtension.episodes(id, server),
      servers: async ({ id }) => fqdmExtension.servers(id),
      resolve: async ({ episodeId, server }) =>
        fqdmExtension.resolve(episodeId, String(server ?? '').trim() || String(registry.values('fqdm').server ?? '')),
      duration: async ({ episodeId, server }) =>
        fqdmExtension.duration(episodeId, String(server ?? '').trim() || String(registry.values('fqdm').server ?? '')),
      /** Lets `online/stream` continue on a sibling line when this one is dead. */
      alternates: async ({ episodeId, server }) => fqdmExtension.alternates(episodeId, server),
    },
  })

  /**
   * AniCh (https://github.com/Sle2p/AniCh) speaks its own protobuf API and needs
   * an account, so the token lives in the account store and is refreshed on
   * demand from the user/password kept in this extension's settings.
   */
  const anichSettings = () => registry.values('anich') ?? {}
  let anichTokenCache = { token: '', user: '', at: 0 }
  async function anichToken() {
    const values = anichSettings()
    const user = String(values.user ?? '').trim()
    const password = String(values.password ?? '')
    const base = String(values.apiBase ?? '').trim()
    const fresh = anichTokenCache.token !== '' && anichTokenCache.user === user && Date.now() - anichTokenCache.at < 10 * 60 * 1000
    if (fresh) return anichTokenCache.token
    // A token saved from the account card (password login or register) wins for
    // ten minutes, so logging in from the UI takes effect before the next call.
    const saved = accountStore.get('anich')
    if (saved?.secret && Date.now() - Number(saved.savedAt ?? 0) < 10 * 60 * 1000) {
      anichTokenCache = { token: saved.secret, user, at: Date.now() }
      return saved.secret
    }
    if (user === '' || password === '') {
      if (saved?.secret) {
        anichTokenCache = { token: saved.secret, user, at: Date.now() }
        return saved.secret
      }
      throw new Error('AniCh 需要账号：在「设置 → 片源 → AniCh」里登录，或把邮箱与密码填进偏好')
    }
    const result = await anich.login({ base, user, password })
    anichTokenCache = { token: result.token, user, at: Date.now() }
    accountStore.set('anich', {
      secret: result.token,
      fields: { kind: 'password', name: user, email: user },
      savedAt: Date.now(),
    })
    console.info(`[dsh-anime] anich login ok user=${user}`)
    return result.token
  }
  async function anichCall(name, args) {
    const values = anichSettings()
    const base = String(values.apiBase ?? '').trim()
    const token = await anichToken()
    return anich[name]({ base, token, ...args })
  }
  /**
   * 这一集的真实线路表。
   *
   * 线路是跟着集数走的，不是跟着番剧走，也不存在「线路1…线路8」这种固定槽位：
   * 实测一集 15 条，各有 caption。没指定集数时问第一话，这样刚选完番剧就能
   * 显示真实线路名。
   *
   * 结果按 (番剧, 集) 缓存几分钟，有两个原因：站点每次请求回的线路顺序会变，
   * 不缓存的话「线路3」在界面上是 A、点下去解析成 B，一边能播一边报错；而且
   * 它很容易限流，拖进度重开流再各请求一次就把自己挡在门外了。
   */
  const LINE_TTL = 3 * 60 * 1000
  const lineCache = new Map()
  async function anichLines(animeId, episode) {
    const wanted = Number(String(episode ?? '').replace(/[^0-9]/g, ''))
    const id = String(animeId ?? '').replace(/[^0-9]/g, '')
    const index = Number.isFinite(wanted) && wanted > 0 ? wanted : 1
    const key = `${id}|${index}`
    const hit = lineCache.get(key)
    if (hit !== undefined && Date.now() - hit.at < LINE_TTL) return hit.lines
    const raw = await anichCall('sources', { id, episode: index })
    const lines = Array.isArray(raw) ? raw : []
    if (lines.length === 0) return lines
    if (lineCache.size > 32) lineCache.clear()
    lineCache.set(key, { at: Date.now(), lines })
    return lines
  }
  /**
   * 有些线路的地址只在带 Referer 时才给流（AniCh 自己的播放页在那里）。
   * 一律带上，比带着空 Referer 被 403 强。
   */
  function anichLineHeaders(url) {
    const headers = { 'user-agent': 'Mozilla/5.0' }
    try {
      headers.referer = new URL(String(url)).origin + '/'
    } catch {
      headers.referer = 'https://anich.buzz/'
    }
    return headers
  }
  /** 拿 token 之后补头像/昵称：/init 失败不影响登录本身。 */
  async function anichProfile(base, token, fallback = {}) {
    try {
      const user = await anich.profile({ base, token })
      return { ...fallback, ...user, name: user.name || fallback.name || fallback.email || '' }
    } catch (error) {
      console.info(`[dsh-anime] anich profile skipped: ${error?.message ?? error}`)
      return fallback
    }
  }
  /** AniCh 用邮箱 + 密码换 token；注册要先发邮箱验证码。 */
  const anichAccount = {
    provider: 'anich',
    label: 'AniCh',
    hint: '用 AniCh 的邮箱 + 密码登录；没有账号可以直接在这里注册，验证码会发到邮箱。',
    kind: 'password',
    // 只在「AniCh 索引」这个数据源自己的偏好面板里出现：它是解锁这个源的
    // 账号，放在设置 → 账号里会让人以为和数据源无关（也省得多一份重复卡片）。
    scoped: true,
    link: 'https://github.com/Sle2p/AniCh',
    placeholder: '也可以直接粘贴 token',
    login: async ({ user, password }) => {
      const base = String(anichSettings().apiBase ?? '').trim()
      const result = await anich.login({ base, user, password })
      anichTokenCache = { token: result.token, user, at: Date.now() }
      const info = await anichProfile(base, result.token, { name: user, email: user })
      console.info(`[dsh-anime] anich account login user=${user}`)
      return {
        secret: result.token,
        fields: {
          kind: 'password',
          name: info.name ?? user,
          email: info.email ?? user,
          avatar: info.avatar ?? '',
          uid: info.uid ?? '',
        },
        savedAt: Date.now(),
      }
    },
    sendCode: async (email) =>
      anich.sendCode({ base: String(anichSettings().apiBase ?? '').trim(), email }),
    register: async ({ email, code, name, password }) => {
      const base = String(anichSettings().apiBase ?? '').trim()
      const result = await anich.register({ base, email, code, name, password })
      anichTokenCache = { token: result.token, user: String(email), at: Date.now() }
      const info = await anichProfile(base, result.token, { name: result.name || name, email: String(email) })
      console.info(`[dsh-anime] anich account register email=${email}`)
      return {
        secret: result.token,
        fields: {
          kind: 'password',
          name: info.name ?? result.name ?? name,
          email: info.email ?? String(email),
          avatar: info.avatar ?? '',
          uid: info.uid ?? '',
        },
        savedAt: Date.now(),
      }
    },
    verify: async (token) => {
      const secret = String(token ?? '').trim()
      if (secret === '') throw new Error('token 不能为空')
      const info = await anichProfile(String(anichSettings().apiBase ?? '').trim(), secret, {})
      return { secret, fields: { kind: 'token', ...info }, savedAt: Date.now() }
    },
  }
  registry.register({
    manifest: {
      id: 'anich',
      name: 'AniCh',
      type: 'online',
      defaultEnabled: false,
      version: '1.0.1',
      author: 'Sle2p',
      lang: 'zh',
      description: 'AniCh 的番剧索引与线路；接口是 protobuf，需要登录（登录与注册在「AniCh 索引」数据源的偏好面板里）。',
      website: 'https://github.com/Sle2p/AniCh',
      timeoutMs: 30000,
      dub: false,
      // 账号卡片挂在「AniCh 索引」数据源那一侧（见 anich-data 的 account）：
      // 用户是在那里配 apiBase 的，登录/注册就该在旁边。凭据仍是同一条 anich。
      actions: [
        {
          id: 'repo',
          kind: 'open',
          url: 'https://github.com/Sle2p/AniCh',
          icon: 'external',
          label: '打开 AniCh 仓库',
          labelEn: 'Open AniCh repo',
        },
      ],
      settings: [
        {
          key: 'user',
          kind: 'text',
          default: '',
          label: 'AniCh 账号',
          labelEn: 'AniCh account',
          placeholder: '邮箱',
          hint: '登录只用来取番剧与线路数据，弹幕和评论不接。',
          hintEn: 'Only used to read catalogues and streams; no danmaku or comments.',
        },
        { key: 'password', kind: 'text', default: '', label: 'AniCh 密码', labelEn: 'AniCh password', placeholder: '密码' },
        {
          key: 'apiBase',
          kind: 'text',
          default: 'https://ani.emmmm.eu.org',
          label: '接口地址',
          labelEn: 'API base',
          placeholder: 'https://ani.emmmm.eu.org',
          hint: '主站连不上时换成 https://api.500403.xyz。',
          hintEn: 'Switch to https://api.500403.xyz if the main host is down.',
        },
      ],
    },
    handlers: {
      search: async ({ term }) => anichCall('search', { term }),
      browse: async ({ page }) => anichCall('browse', { page }),
      latest: async () => anichCall('latest', {}),
      // 集数 id 必须带上番剧 id：resolve 只拿得到 episodeId，而 /vod 要的是
      // (番剧, 集数) 一对。以前这里只回集号，于是 resolve 拿 "1" 去当番剧 id，
      // 一路报「需要番剧 id 与集数」—— 在线源就是这么卡住的。
      episodes: async ({ id }) => {
        const animeId = String(id ?? '').replace(/[^0-9]/g, '')
        if (animeId === '') return []
        const items = await anichCall('episodes', { id: animeId })
        return items.map((item) => ({ id: `${animeId}|${item.number}`, number: item.number, title: item.title }))
      },
      // 线路表是按集给的：一集实测 15 条，各有 caption。没给集数时按第一话回答，
      // 这样选完番剧立刻就能看到真实线路名，而不是假的「线路1…线路8」。
      servers: async ({ id, episode }) => {
        const animeId = String(id ?? '').replace(/[^0-9]/g, '')
        if (animeId === '') return []
        const lines = await anichLines(animeId, episode)
        return lines.map((line, index) => ({
          name: anich.lineName(index, line.caption),
          index,
          caption: line.caption,
          type: line.type,
        }))
      },
      resolve: async ({ episodeId, server }) => {
        const parts = String(episodeId ?? '').split('|')
        const animeId = String(parts[0] ?? '').replace(/[^0-9]/g, '')
        const episode = Number(String(parts[1] ?? '').replace(/[^0-9]/g, ''))
        if (animeId === '' || !Number.isFinite(episode) || episode <= 0) {
          throw new Error('AniCh：集数 id 少了番剧 id（应为「番剧|集」）')
        }
        const lines = await anichLines(animeId, episode)
        if (lines.length === 0) throw new Error('AniCh：这一集没有可用线路')
        // 线路身份是「线路N」里的 N，caption 只是说明（同一集里会重名，不能当键）。
        const slot = Number((String(server ?? '').match(/^线路(\d+)/) ?? [])[1] ?? 0) || 1
        const picked = lines[slot - 1] ?? lines[0]
        return {
          url: picked.url,
          type: picked.type,
          quality: picked.caption === '' ? 'auto' : picked.caption,
          headers: anichLineHeaders(picked.url),
        }
      },
    },
    // 账号卡片搬到「AniCh 索引」数据源那一侧（见 anich-data 的 account），
    // 但这个在线源读的仍是同一条 anich 凭据，不需要在这里再声明一次。
  })

  /**
   * AniCh 的「数据源」面：同一个账号、同一份 lib/anich.js，只提供番剧索引与
   * 详情，不带播放地址。凭据留在 `anich` 扩展里，这里读它的 values，避免让
   * 用户在两个扩展里各填一次邮箱密码。
   */
  function anichSubject(item) {
    const id = String(item?.id ?? '')
    const page = id === '' ? null : `https://ani.emmmm.eu.org/bangumi/${id}`
    return {
      id: `anich-${id}`,
      anichId: id,
      title: item?.title ?? '',
      titleNative: item?.title ?? '',
      titleChinese: item?.title ?? '',
      titleOriginal: item?.title ?? '',
      titleRomaji: '',
      titleEnglish: '',
      cover: item?.cover ?? null,
      summary: item?.note ?? item?.summary ?? '',
      score: typeof item?.score === 'number' && item.score > 0 ? item.score : null,
      rank: null,
      episodes: Number(item?.total ?? item?.episodesTotal ?? 0) || null,
      date: item?.date ?? null,
      url: page,
      // 详情页那个「去源头看」的按钮和追番卡片上的链接读的都是 siteUrl，只给 url
      // 时它们对 AniCh 一律不显示。
      siteUrl: page,
      sourceLabel: 'AniCh',
      source: 'anich',
    }
  }

  registry.register({
    manifest: {
      id: 'anich-data',
      name: 'AniCh 索引',
      type: 'data',
      defaultEnabled: false,
      version: '1.0.2',
      author: 'Sle2p',
      lang: 'zh',
      description: 'AniCh 的番剧索引：季度、搜索、详情与集数。播放地址在「AniCh」在线源里。',
      icon: 'https://raw.githubusercontent.com/Sle2p/AniCh/main/assets/images/logo.png',
      website: 'https://github.com/Sle2p/AniCh',
      timeoutMs: 30000,
      // 账号（登录 + 注册）挂在数据源这一侧：它解锁的就是这个索引插件，
      // 用户在这里配置 apiBase 时顺手就能登录/注册，而不是去设置 → 账号里找。
      account: { provider: 'anich', kind: 'password' },
      settings: [],
    },
    handlers: {
      season: async ({ year }) => {
        const list = await anichCall('browse', { page: 1 })
        const wanted = Number(year) || 0
        const filtered = wanted > 0
          ? list.filter((item) => String(item?.date ?? '').startsWith(String(wanted)))
          : list
        return { items: (filtered.length > 0 ? filtered : list).map(anichSubject) }
      },
      search: async ({ term }) => ({
        items: (await anichCall('search', { term })).map(anichSubject),
      }),
      browse: async ({ page }) => ({
        items: (await anichCall('browse', { page })).map(anichSubject),
      }),
      detail: async ({ id }) => {
        const numericId = String(id ?? '').replace(/[^0-9]/g, '')
        const raw = await anichCall('detail', { id: numericId })
        const subject = anichSubject({
          id: raw.id,
          title: raw.title,
          cover: raw.cover,
          note: raw.overview,
          score: raw.score,
        })
        // 详情页的字段名是另一套（genres/seasonYear/aliases），这里补上它认的
        // 那几个，界面就不用为 AniCh 单独写一遍渲染分支。
        return {
          ...subject,
          summary: raw.overview,
          tags: raw.genres,
          genres: raw.genres,
          region: raw.region,
          year: raw.year,
          seasonYear: raw.year > 0 ? raw.year : null,
          aliases: raw.titles.filter((title) => title !== '' && title !== raw.title),
          lang: raw.lang,
          // 详情页要靠集数才能显示「共 N 集」，追番卡片的进度条也靠它。站点详情
          // 不带总数，单问一次集数接口；失败就当未知，不要拦住整个详情页。
          episodes:
            subject.episodes ??
            (await anichCall('episodes', { id: numericId })
              .then((list) => (Array.isArray(list) && list.length > 0 ? list.length : null))
              .catch(() => null)),
        }
      },
      episodes: async ({ id }) => ({
        items: (await anichCall('episodes', { id: String(id ?? '').replace(/[^0-9]/g, '') })).map((entry) => ({
          id: entry.id,
          number: entry.number,
          title: entry.title,
        })),
      }),
    },
    // 同一个账号实现对象：路由、凭据、登录/注册/校验都在这里，只是卡片现在
    // 渲染在「AniCh 索引」的偏好面板里（scoped: true 让它不出现在设置 → 账号）。
    account: anichAccount,
  })

  /**
   * The declarative sources from the AnimeFlow pack. Each JSON rule becomes its
   * own `online` extension, so adding a source is dropping a file in
   * `assets/sources/animeflow` and updating `index.json`.
   */
  const webSourceDir = resolvePath(PLUGIN_DIR, 'assets', 'sources', 'animeflow')
  registerWebSources({
    registry,
    dir: webSourceDir,
    log: (line) => console.info(`[dsh-anime] ${line}`),
  })

  /**
   * The quality ladder belongs to the online source now, so every caller (the
   * player, the download queue) asks the extension instead of a global setting.
   */
  function biliQuality() {
    const value = registry.values('bilibili').quality
    return clampInt(value, 80, 16, 120)
  }

  /** Routes that change state read a JSON body instead of query parameters. */
  const postHandlers = {
    async 'extensions/source-restore'(body) {
      const id = String(body?.id ?? '').trim()
      const relative = String(body?.path ?? '').trim()
      const listed = SOURCE_FILES[id]
      if (listed === undefined) return { ok: false, error: { message: `没有找到 ${id} 的源码` } }
      if (!listed.includes(relative)) {
        return { ok: false, error: { message: `${id} 没有 ${relative} 这个文件` } }
      }
      const absolute = resolvePath(PLUGIN_DIR, relative)
      if (!absolute.startsWith(PLUGIN_DIR)) throw new Error('refusing to write outside the plugin')
      const [newest] = listBackups(absolute)
      if (newest === undefined) return { ok: false, error: { message: '这个文件还没有备份，无法还原' } }
      const from = resolvePath(STATE_DIR, 'backups', newest.name)
      copyFileSync(from, absolute)
      const checked = await checkSyntax(absolute)
      if (!checked.ok) {
        return { ok: false, error: { message: `备份本身语法就不通，已经写回去了：${checked.message}` } }
      }
      const text = readFileSync(absolute, 'utf8')
      return {
        ok: true,
        id,
        path: relative,
        restoredFrom: newest.name,
        restoredAt: newest.at,
        lines: text.split('\n').length,
        bytes: Buffer.byteLength(text, 'utf8'),
        needsRestart: relative === 'index.js',
      }
    },

    async 'extensions/source-save'(body) {
      const id = String(body?.id ?? '').trim()
      const relative = String(body?.path ?? '').trim()
      const listed = SOURCE_FILES[id]
      if (listed === undefined) return { ok: false, error: { message: `没有找到 ${id} 的源码` } }
      if (!listed.includes(relative)) {
        return { ok: false, error: { message: `${id} 没有 ${relative} 这个文件` } }
      }
      const content = String(body?.content ?? '')
      if (content.length > SOURCE_MAX_BYTES) {
        return { ok: false, error: { message: `超过 ${Math.round(SOURCE_MAX_BYTES / 1024)} KB，拒绝写入` } }
      }
      const absolute = resolvePath(PLUGIN_DIR, relative)
      if (!absolute.startsWith(PLUGIN_DIR)) throw new Error('refusing to write outside the plugin')
      const backup = backupSource(absolute)
      writeFileSync(absolute, content, 'utf8')
      const checked = await checkSyntax(absolute)
      if (!checked.ok) {
        copyFileSync(backup, absolute)
        return { ok: false, error: { message: `语法错误，已还原：${checked.message}` } }
      }
      return {
        ok: true,
        id,
        path: relative,
        bytes: Buffer.byteLength(content, 'utf8'),
        lines: content.split('\n').length,
        backup: backup.split(/[\\/]/).pop(),
        needsRestart: relative === 'index.js',
      }
    },

    async 'extensions/save'(body) {
      const id = String(body?.id ?? '').trim()
      if (id === '') return { ok: false, error: { message: '缺少扩展 id' } }
      await registry.saveSettings(id, body?.values ?? {})
      return { items: registry.list() }
    },

    async 'extensions/toggle'(body) {
      const id = String(body?.id ?? '').trim()
      if (id === '') return { ok: false, error: { message: '缺少扩展 id' } }
      await registry.setEnabled(id, body?.enabled === true)
      return { items: registry.list() }
    },

    /**
     * Press a button an extension declared in `manifest.actions`.
     *
     * Extensions stay data sources: this only resolves what the button means
     * (`open` → a URL the page opens, `call` → run the handler and hand back its
     * value). Navigation and playback remain the page's job.
     */
    async 'extensions/action'(body) {
      const id = String(body?.id ?? '').trim()
      const action = String(body?.action ?? '').trim()
      if (id === '' || action === '') return { ok: false, error: { message: '缺少扩展 id 或按钮 id' } }
      try {
        const result = await registry.runAction(id, action, body?.args ?? {})
        return { ok: true, ...result }
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
    },

    async 'settings/save'(body) {
      const previous = settingsSync()
      const next = await saveSettings(body ?? {})
      settingsState = next
      const service = await torrents()
      await service.setConfig({ kind: next.torrent.kind, qbittorrent: next.qbittorrent })
      // A cache-dir change can only take effect on a fresh engine.
      if (previous.torrent.cacheDir !== next.torrent.cacheDir) torrentService = null
      return settingsView()
    },

    async 'settings/pick-dir'(body) {
      return pickDirectory(body?.start)
    },

    async 'settings/reset'() {
      settingsState = await resetSettings()
      torrentService = null
      return settingsView()
    },

    async 'downloads/bili'(body) {
      const cid = Number(body.cid ?? 0) || 0
      const epId = Number(body.ep_id ?? 0) || 0
      const bvid = String(body.bvid ?? '').trim()
      const qn = clampInt(body.qn, biliQuality(), 16, 120)
      if (cid <= 0 || (epId <= 0 && !/^BV[0-9A-Za-z]+$/.test(bvid))) {
        return { ok: false, error: { message: '需要 cid，加上 ep_id（番剧）或 bvid（投稿）之一' } }
      }
      const play = epId > 0 ? await resolvePlay(epId, cid, qn) : await resolveVideoPlay(bvid, cid, qn)
      const title = String(body.title ?? '').trim() === '' ? `bilibili-${epId > 0 ? `ep${epId}` : bvid}-${qn}p` : String(body.title).trim()
      return downloadQueue.startBiliDownload({
        url: play.url,
        headers: {
          referer: BILIBILI_REFERER,
          origin: 'https://www.bilibili.com',
          'user-agent': BILIBILI_UA,
        },
        title,
        extension: '.mp4',
        total: play.size ?? 0,
      })
    },

    /**
     * Download an online source's episode to a file.
     *
     * Same line walk as `online/stream`, for a different reason: playback can
     * stop at the first line that produces a byte, but a download has to commit
     * to one URL for minutes, so each candidate is probed with ffprobe first and
     * the first one that actually opens wins.
     */
    async 'downloads/stream'(body) {
      const source = String(body.source ?? '').trim()
      const episode = String(body.episode ?? '').trim()
      const server = String(body.server ?? '').trim()
      const quality = String(body.quality ?? '').trim()
      const dub = body.dub === true
      const direct = String(body.url ?? '').trim()
      const title = String(body.title ?? '').trim()
      if (source === '' && direct === '') return { ok: false, error: { message: '需要 source + episode，或者直接给 url' } }
      const ffmpeg = await findFfmpeg()
      // 这条路由住在 routes 对象里（apply 作用域），而 streamCandidates/goodLine 在
      // 下面的 webServer 注入回调里，够不着——所以候选表的排法在这里就地写一遍：
      // 先用户点的那条，再顺着站点给的顺序往下试，最多六条。
      let candidates = [server]
      if (source !== '' && episode !== '') {
        const [episodeAnime, episodeNo] = String(episode).split('|')
        try {
          const raw = await registry.call(source, 'servers', episodeNo === undefined ? { id: episodeAnime } : { id: episodeAnime, episode: episodeNo })
          const lines = (Array.isArray(raw) ? raw : []).filter((item) => item !== null && typeof item === 'object' && 'type' in item)
          const ordered = lines.map((item) => String(item?.name ?? '').trim()).filter((name) => name !== '')
          if (ordered.length > 0) {
            const at = ordered.indexOf(server)
            candidates = (at > 0 ? [...ordered.slice(at), ...ordered.slice(0, at)] : ordered).slice(0, 6)
          }
        } catch {
          candidates = [server]
        }
      }
      let lastError = null
      for (const [attempt, name] of candidates.entries()) {
        try {
          let target = direct
          let headers = {}
          let duration = 0
          let bitstreamFilter = ''
          let label = title
          if (source !== '' && episode !== '') {
            const resolved = await resolveOnline(source, episode, name, dub)
            const tracks = resolvedTracks(resolved, quality)
            target = String(tracks.chosen?.url ?? '')
            headers = tracks.headers ?? {}
            if (target === '') throw new Error('这一集没有拿到可以下载的地址')
            // 先要字节，再认容器：死线路在 ffprobe 眼里也可能「能打开」（播放列表
            // 拿得到，分片主机早就没了），下载就会卡在 0 B。
            const sniff = await sniffMedia(target, headers)
            const probe = await probeStream(target, { headers })
            if (String(probe?.video ?? '') === '') {
              throw new Error(`这条线路打不开：${probe?.reason ?? 'ffprobe 没有认出视频流'}`)
            }
            // HLS delivers AAC as ADTS frames, which an MP4 cannot hold as-is.
            const container = String(probe?.container ?? '').toLowerCase()
            if (sniff.kind === 'hls' || container.includes('mpegts') || container.includes('hls') || container.includes('applehttp')) {
              bitstreamFilter = 'aac_adtstoasc'
            }
            duration = await probeDurationSeconds(target, { headers }).catch(() => 0)
            console.info(`[dsh-anime] download source=${source} server=${resolved?.server ?? name} try=${attempt + 1}/${candidates.length} container=${container || '-'} sniff=${sniff.kind}/${sniff.bytes}B`)
            if (label === '') {
              const parts = episode.split('|')
              label = `${source}-${parts[0] ?? ''}${parts[1] === undefined ? '' : `-${parts[1]}`}`
            }
          }
          const started = await downloadQueue.startStreamDownload({
            url: target,
            headers,
            title: label,
            extension: /\.(mkv|mp4|m4v|flv)$/i.test(body.extension ?? '') === true ? String(body.extension) : '.mp4',
            duration,
            ffmpegPath: ffmpeg,
            bitstreamFilter,
            source: source === '' ? '在线流' : String(registry.list().find((item) => item.id === source)?.name ?? source),
          })
          if (started?.ok === false) {
            lastError = new Error(String(started?.error?.message ?? '下载没能开始'))
            continue
          }
          // A line can pass ffprobe and still die in the remux (TLS reset, 403 on
          // the first real read). Watch the job for its first bytes before handing
          // it to the user: a download commits to one URL for minutes.
          const id = String(started?.data?.job?.id ?? '')
          const settled = await waitForFirstBytes(id, 25000)
          if (settled.ok) return started
          await downloadQueue.cancel(id).catch(() => undefined)
          await new Promise((resolve) => setTimeout(resolve, 300))
          await downloadQueue.remove(id).catch(() => undefined)
          lastError = new Error(`线路「${name}」没能开始产出数据：${settled.reason}`)
          console.warn(`[dsh-anime] download 线路「${name}」首次读就断了：`, settled.reason)
        } catch (error) {
          lastError = error
          console.warn(`[dsh-anime] download 线路「${name}」不可用：`, error?.message ?? error)
        }
      }
      return { ok: false, error: { message: String(lastError?.message ?? '没有能下载的线路') } }
    },

    async 'downloads/torrent'(body) {
      const hash = String(body.hash ?? '').trim()
      if (!/^[0-9a-fA-F]{40}$/.test(hash)) return { ok: false, error: { message: 'hash 无效' } }
      const index = Number(body.index ?? 0) || 0
      return guarded('torrent', async () => {
        const service = await torrents()
        const listing = await service.files(hash)
        const file = Array.isArray(listing?.files) ? listing.files[index] : null
        return downloadQueue.startTorrentDownload({
          hash,
          fileIndex: index,
          title: String(body.title ?? file?.name ?? hash).trim(),
        })
      })
    },

    async 'downloads/cancel'(body) {
      return downloadQueue.cancel(String(body.id ?? ''))
    },

    async 'downloads/remove'(body) {
      return downloadQueue.remove(String(body.id ?? ''))
    },

    async 'downloads/clear'() {
      return downloadQueue.clearFinished()
    },

    async 'downloads/reveal'(body) {
      const target = String(body.path ?? '').trim()
      if (target === '') return { ok: false, error: { message: '缺少路径' } }
      return downloadQueue.reveal(target)
    },

    async 'player/open'(body) {
      const target = String(body.url ?? '').trim()
      if (!/^https?:\/\//.test(target)) return { ok: false, error: { message: 'url 无效' } }
      const current = settingsSync()
      // The page can override the player for a single hand-off: that is how the
      // player menu lists every detected binary, not only the configured one.
      const requested = String(body.playerId ?? '').trim()
      // The desktop shell turns POSTs into body-less GETs, so the payload can
      // arrive as a URL-encoded string instead of JSON.
      const playerId = requested === '' ? current.player.external : requested
      return openInPlayer(playerId, target, {
        command: current.player.command,
        start: Number(body.start ?? 0),
        title: current.player.titleInWindow === false ? '' : String(body.title ?? ''),
        anime4k: String(body.anime4k ?? '') === '' ? current.player.anime4k : String(body.anime4k),
      })
    },

    /** What the 画质增强 picker offers: the folder, the .glsl files, the presets. */
    async 'player/shaders'() {
      return embeddedMpv.shaderCatalogue()
    },

    /** Show the shader folder in Explorer, the way seanime's picker does. */
    async 'player/shaders/open'() {
      const { dir } = embeddedMpv.shaderCatalogue()
      try {
        await new Promise((resolvePromise, rejectPromise) => {
          execFile('explorer', [dir], () => resolvePromise())
          setTimeout(resolvePromise, 1500).unref?.()
          void rejectPromise
        })
        return { ok: true, dir }
      } catch (error) {
        return { ok: false, error: { message: String(error?.message ?? error) } }
      }
    },

    /**
     * There is no embedded-mpv surface any more: PrismFlow is the only in-panel
     * player, and mpv is reachable solely as an external application through
     * `player/play`. The former `player/embed*` routes were removed with the
     * overlay so nothing can start a second player behind the page's back.
     */

    async 'accounts/save'(body) {
      const provider = String(body.provider ?? '').trim()
      const value = String(body.value ?? '').trim()
      if (provider === '') return { ok: false, error: { message: '缺少 provider' } }
      if (value === '') return { ok: false, error: { message: '缺少要保存的内容' } }
      try {
        await saveAccount(provider, value)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      return accountsView()
    },

    /**
     * 用户名 + 密码登录：provider 自己实现 `login({ user, password })`，宿主只负责
     * 把拿到的凭据存进 accountStore（AniCh 是这种）。
     */
    async 'accounts/password'(body) {
      const provider = String(body.provider ?? '').trim()
      const user = String(body.user ?? '').trim()
      const password = String(body.password ?? '')
      if (provider === '') return { ok: false, error: { message: '缺少 provider' } }
      if (user === '' || password === '') return { ok: false, error: { message: '邮箱和密码都要填' } }
      let account
      try {
        account = registry.account(provider)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      if (typeof account.login !== 'function') {
        return { ok: false, error: { message: `${account.label ?? provider} 不支持账号密码登录` } }
      }
      try {
        const saved = await account.login({ user, password })
        if (saved?.secret) accountStore.set(provider, saved)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      return accountsView()
    },

    /** 发送邮箱验证码（注册用），provider 实现 `sendCode(email)`。 */
    async 'accounts/code'(body) {
      const provider = String(body.provider ?? '').trim()
      const email = String(body.email ?? '').trim()
      if (provider === '') return { ok: false, error: { message: '缺少 provider' } }
      let account
      try {
        account = registry.account(provider)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      if (typeof account.sendCode !== 'function') {
        return { ok: false, error: { message: `${account.label ?? provider} 不支持发送验证码` } }
      }
      try {
        const result = await account.sendCode(email)
        return { ok: true, data: { message: result?.message ?? '验证码已发送' } }
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
    },

    /** 注册：provider 实现 `register({ email, code, name, password })`，成功后直接登录。 */
    async 'accounts/register'(body) {
      const provider = String(body.provider ?? '').trim()
      if (provider === '') return { ok: false, error: { message: '缺少 provider' } }
      let account
      try {
        account = registry.account(provider)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      if (typeof account.register !== 'function') {
        return { ok: false, error: { message: `${account.label ?? provider} 不支持在这里注册` } }
      }
      try {
        const saved = await account.register({
          email: String(body.email ?? '').trim(),
          code: String(body.code ?? '').trim(),
          name: String(body.name ?? '').trim(),
          password: String(body.password ?? ''),
        })
        if (saved?.secret) accountStore.set(provider, saved)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      return accountsView()
    },

    async 'accounts/logout'(body) {
      const provider = String(body.provider ?? '').trim()
      if (provider === '') return { ok: false, error: { message: '缺少 provider' } }
      try {
        registry.account(provider)
      } catch (error) {
        return { ok: false, error: { message: error?.message ?? String(error) } }
      }
      accountStore.clear(provider)
      return accountsView()
    },

    async 'accounts/qr'(body) {
      const account = accountProvider(body?.provider)
      if (account.kind === 'oauth') {
        /**
         * OAuth: the extension only knows how to build the authorize URL. The
         * page passes the loopback callback it can actually receive, we keep
         * the `state` so the callback route can trust it, and the page polls
         * the same key until the exchange lands.
         */
        const redirectUri = String(body?.redirectUri ?? '').trim()
        if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i.test(redirectUri)) {
          return { ok: false, error: { message: '需要本机回调地址（127.0.0.1 或 localhost）' } }
        }
        sweepPendingLogins()
        const state = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
        try {
          const built = await registry.call(account.id, 'authorize', { redirectUri, state })
          const url = String(built?.url ?? '')
          if (url === '') return { ok: false, error: { message: `${account.label} 没有给出授权地址` } }
          pendingLogins.set(state, { provider: account.id, startedAt: Date.now(), redirectUri })
          return { provider: account.id, kind: 'oauth', state, url, expiresIn: 300 }
        } catch (error) {
          return { ok: false, error: { message: error?.message ?? String(error) } }
        }
      }
      if (typeof account.start !== 'function') {
        return { ok: false, error: { message: `${account.label} 不支持扫码登录` } }
      }
      const qr = await account.start()
      return { provider: account.id, ...qr, expiresIn: 180 }
    },

    async 'torrent/add'(body) {
      const magnet = String(body.magnet ?? '').trim()
      if (!/^magnet:\?/i.test(magnet)) return { ok: false, error: { message: '需要 magnet:? 开头的磁力链接' } }
      return guarded('torrent', async () => {
        const hash = await (await torrents()).add(magnet)
        return { hash, magnet }
      })
    },
    async 'torrent/remove'(body) {
      const hash = String(body.hash ?? '').trim()
      if (!/^[0-9a-fA-F]{40}$/.test(hash)) return { ok: false, error: { message: 'hash 无效' } }
      return guarded('torrent', async () => ({ removed: await (await torrents()).remove(hash) }))
    },
    async 'torrent/config'(body) {
      return guarded('torrent', async () => {
        const patch = {}
        if (typeof body.kind === 'string' && (body.kind === 'builtin' || body.kind === 'qbittorrent')) patch.kind = body.kind
        if (body.qbittorrent !== undefined && body.qbittorrent !== null) {
          const source = body.qbittorrent
          const next = {}
          if (typeof source.url === 'string' && source.url.trim() !== '') next.url = source.url.trim()
          if (typeof source.username === 'string') next.username = source.username
          // An empty password means "keep the stored one", so the UI never has to
          // echo a secret back to the host just to save an unrelated field.
          if (typeof source.password === 'string' && source.password !== '') next.password = source.password
          patch.qbittorrent = next
        }
        const service = await torrents()
        await service.setConfig(patch)
        return service.status()
      })
    },
    async 'torrent/open-player'(body, context) {
      const hash = String(body.hash ?? '').trim()
      const index = Number(body.index ?? 0) || 0
      if (!/^[0-9a-fA-F]{40}$/.test(hash)) return { ok: false, error: { message: 'hash 无效' } }
      return guarded('torrent', async () => {
        const service = await torrents()
        const target = `${context.origin}${ROUTE_PREFIX}/torrent/stream?hash=${hash}&index=${index}`
        const result = await service.openInPlayer(String(body.player ?? ''), target)
        return { ...result, url: target }
      })
    },
  }

  return ctx.inject(['webServer'], (hostCtx) => {
    const webServer = hostCtx?.webServer
    if (webServer === undefined || typeof webServer.register !== 'function') {
      console.warn('[dsh-anime] webServer is unavailable, so the page has no data routes')
      return undefined
    }

    const instanceToken = Symbol('dsh-anime-instance')

    /**
     * Publish the handler and register the path once. Re-applying replaces the
     * handler instead of registering a duplicate route, which is what used to
     * leave the page talking to an older build.
     */
    const register = (route) => {
      ROUTE_REGISTRY.handlers.set(route.path, { handler: route.handler, owner: instanceToken })
      if (ROUTE_REGISTRY.paths.has(route.path)) return () => {}
      // A reload that skipped the previous disposer leaves its route in the
      // host's exact table, and register() then throws "duplicate exact route"
      // — so the path answered with an older build's handler forever. The table
      // is the host's own Map, and dropping our own path from it is the only
      // way to take the route back.
      const kind = route.kind === 'prefix' ? 'prefix' : 'exact'
      const table = kind === 'exact' ? webServer.exact : webServer.prefix
      if (table instanceof Map && table.has(route.path)) table.delete(route.path)
      try {
        webServer.register({
          kind,
          path: route.path,
          handler: (request, response) => {
            const entry = ROUTE_REGISTRY.handlers.get(route.path)
            if (entry === undefined) {
              sendJson(response, 404, { ok: false, error: { message: `${route.path} 没有处理器` } })
              return undefined
            }
            return entry.handler(request, response)
          },
        })
        ROUTE_REGISTRY.paths.add(route.path)
        return () => {}
      } catch (error) {
        console.warn('[dsh-anime] route not registered', route.path, error?.message ?? error)
        ROUTE_REGISTRY.paths.delete(route.path)
        return () => {}
      }
    }

    const disposers = Object.entries(handlers).map(([name, handler]) =>
      register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/${name}`,
        handler: async (request, response) => {
          if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' })
            response.end()
            return
          }
          try {
            const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
            const guardId = ROUTE_GUARD[name.split('/')[0]]
            if (guardId !== undefined) registry.assertEnabled(guardId)
            const result = await handler(request, url)
            sendJson(response, 200, result.ok === false ? result : { ok: true, data: result.data ?? result })
          } catch (error) {
            sendFailure(response, error)
          }
        },
      }),
    )

    /**
     * Playback for a generic online source.
     *
     * Registered as a raw route (not a JSON handler): the host hands these the
     * real ServerResponse, which is the only way to pipe bytes. The GET handler
     * table instead calls its entries with (request, url) and serialises whatever
     * they return, so a streaming entry there would fail on response.writeHead.
     */
    // Cover proxy: a raw route, because a JSON handler would serialise the image.
  register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/online/cover`,
    handler: async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://dsh-anime.local')

        const source = String(url.searchParams.get('source') ?? '').trim()
        const target = String(url.searchParams.get('url') ?? '').trim()
        const parsed = (() => {
          try {
            return new URL(target)
          } catch {
            return null
          }
        })()
          if (parsed === null || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
          sendJson(response, 400, { ok: false, error: { message: '封面地址不对' } })
          return
        }
        const host = parsed.hostname.toLowerCase()
        const isPrivate =
          host === 'localhost' ||
          host.endsWith('.local') ||
          /^(?:10|127)\./.test(host) ||
          /^192\.168\./.test(host) ||
          /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
          host === '::1' ||
          host === '0.0.0.0'
          if (isPrivate) {
          sendJson(response, 400, { ok: false, error: { message: '封面地址不对' } })
          return
        }
        const referer =
          registry
            .ofType('online')
            .map(({ manifest }) => manifest)
            .find((manifest) => manifest.id === source)?.website ?? ''
        try {
          const upstream = await fetch(parsed.toString(), {
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              ...(referer === '' ? {} : { referer }),
              accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
          })
          if (upstream.ok !== true || upstream.body === null) {
            sendJson(response, 404, { ok: false, error: { message: `封面返回 HTTP ${upstream.status}` } })
            return
          }
          const type = upstream.headers.get('content-type') ?? 'image/jpeg'
          if (type.startsWith('image/') !== true) {
            sendJson(response, 415, { ok: false, error: { message: '这个地址不是图片' } })
            return
          }
          const length = upstream.headers.get('content-length')
          response.writeHead(200, {
            'content-type': type,
            'cache-control': 'public, max-age=43200',
            ...(length === null ? {} : { 'content-length': length }),
          })
          Readable.fromWeb(upstream.body).pipe(response)
          response.on('close', () => {
            upstream.body?.cancel?.().catch(() => undefined)
          })
        } catch (error) {
          if (response.headersSent !== true) {
            sendJson(response, 502, { ok: false, error: { message: `取封面失败：${String(error?.message ?? error)}` } })
          } else {
            response.destroy()
          }
        }
    },
  })

  /**
   * OAuth callback. The provider redirects the browser here with `?code&state`;
   * the code→token exchange needs the client secret, so it happens in the Host
   * and the page never sees the code. Whatever happens, the tab gets a readable
   * page instead of JSON.
   */
  const bangumiCallbackRoute = register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}/bangumi/oauth/callback`,
    handler: async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
      const code = String(url.searchParams.get('code') ?? '').trim()
      const state = String(url.searchParams.get('state') ?? '').trim()
      const denied = String(url.searchParams.get('error') ?? '').trim()
      const page = (ok, title, detail) => {
        const body = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${ok ? '已绑定' : '授权失败'} · Bangumi</title>
<style>
html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;
background:#0d0f15;color:#f2f4f8;font:14px/1.7 "Microsoft YaHei",system-ui,sans-serif}
.card{max-width:520px;padding:28px 32px;border-radius:16px;background:#14161d;
border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 48px rgba(0,0,0,.45)}
h1{margin:0 0 10px;font-size:17px}p{margin:0;color:#98a1b3;font-size:13px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;
background:${ok ? '#5fbf7f' : '#d06a6a'}}
</style></head><body><div class="card"><h1><span class="dot"></span>${title}</h1><p>${detail}</p></div></body></html>`
        response.writeHead(ok ? 200 : 400, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': Buffer.byteLength(body),
          'cache-control': 'no-store',
        })
        response.end(body)
      }
      if (denied !== '') {
        page(false, '授权失败', `Bangumi 返回了 ${denied}。回到设置页重试，或者直接粘贴 Access Token。`)
        return
      }
      const pending = pendingLogins.get(state)
      if (code === '' || pending === undefined) {
        page(false, '授权失败', '这次回调没有对应的登录流程（state 不认识或已过期）。回到设置页重新点「授权」。')
        return
      }
      const { clientId, clientSecret } = bangumiClient()
      try {
        const saved = await bgm.exchangeCode({
          clientId,
          clientSecret,
          code,
          redirectUri: pending.redirectUri,
        })
        accountStore.set('bangumi', saved)
        pendingLogins.delete(state)
        console.info(`[dsh-anime] bangumi oauth ok user=${saved.fields?.name ?? ''}`)
        page(true, 'Bangumi 已绑定', `你好 ${saved.fields?.name ?? ''}，回到应用就能看到番组数据了，这个标签页可以关掉。`)
      } catch (error) {
        console.warn('[dsh-anime] bangumi oauth failed', error?.message ?? error)
        page(false, '授权失败', String(error?.message ?? error))
      }
    },
  })

  /**
   * 这一集按「先点的那条，再往后」排好的线路名单。
   *
   * 只对真的按线路走的源生效：线路条目带 `type`（画质档位没有），否则返回单条。
   * 最多三条——再往后就是站点塞的广告和早已回收的域名，试下去只是让用户多等。
   *
   * 上一次真正播成功的线路排在最前：线路表每次请求顺序都可能变，而「哪条能播」
   * 在一个番剧上是稳定的，记住它比每次从死线路开始试要快得多。
   */
  const goodLine = new Map()
  /**
   * The lines to try for one episode, in order.
   *
   * Two kinds of source can walk beside the clicked line, and they differ in
   * what a line switch actually costs:
   *
   * - a source that declares `alternates` knows how to rebuild the episode id
   *   for another line (FQDM: `anime|sid|nid` — the sid is per-anime, so the id
   *   has to be rewritten, not just the name).
   * - a source whose line entries carry `type` (AniCh) keeps the same episode id
   *   for every line, so only the name changes.
   *
   * Anything else returns just the clicked line. Each candidate is
   * `{ server, episode }`, because the two halves are independent.
   *
   * The last line that actually played is moved to the front: the site's list
   * order changes between requests, while "which line works" is stable per
   * title, so remembering it beats starting from a dead one every time.
   */
  async function streamCandidates(source, episode, server) {
    const single = [{ server, episode }]
    const parts = String(episode ?? '').split('|')
    const id = String(parts[0] ?? '').trim()
    const episodeNo = String(parts[1] ?? '').trim()
    const remembered = goodLine.get(`${source}|${id}`)
    const order = (list) => {
      const seen = new Set()
      const clean = []
      for (const item of list) {
        const name = String(item?.server ?? '').trim()
        if (name === '' || seen.has(name)) continue
        seen.add(name)
        clean.push({ server: name, episode: String(item?.episode ?? episode) })
      }
      if (remembered !== undefined && remembered !== server) {
        const index = clean.findIndex((item) => item.server === remembered)
        if (index > 0) clean.unshift(...clean.splice(index, 1))
      }
      // 六条：实测这一集的能播线路常在第 5～11 条里，而站点每次回的排序都不一样，
      // 只试三条时经常三条全死。成功的那条会被 `goodLine` 记住，下一次直接命中，
      // 所以这条「多试几条」的代价只在第一次播放时付。
      return clean.slice(0, 6)
    }

    // 1) the source can rebuild the episode id for a sibling line
    try {
      const raw = await registry.call(source, 'alternates', { episodeId: episode, server })
      const entries = (Array.isArray(raw) ? raw : [])
        .filter((item) => item !== null && typeof item === 'object')
        .map((item) => ({
          server: String(item?.server ?? item?.name ?? '').trim(),
          episode: String(item?.episodeId ?? item?.episode ?? episode),
        }))
        .filter((item) => item.server !== '' && item.server !== server)
      if (entries.length > 0) return order([{ server, episode }, ...entries])
    } catch {
      /* no such handler — the name-based walk below may still apply */
    }

    // 2) same episode id, other line name (AniCh-style)
    try {
      const raw = await registry.call(source, 'servers', episodeNo === '' ? { id } : { id, episode: episodeNo })
      const items = Array.isArray(raw) ? raw : []
      const lines = items.filter((item) => item !== null && typeof item === 'object' && 'type' in item)
      if (lines.length <= 1) return single
      const names = lines
        .map((item) => String(item?.name ?? '').trim())
        .filter((name) => name !== '')
      const at = names.indexOf(server)
      const rotated = at > 0 ? [...names.slice(at), ...names.slice(0, at)] : [...names]
      return order(rotated.map((name) => ({ server: name, episode })))
    } catch {
      return single
    }
  }

  /**
   * Wait for the transcoder's first byte.
   *
   * Returns the chunk, or null when ffmpeg ended (or stayed silent past the
   * deadline) without ever producing one. The caller can still write a status
   * line at that point, because nothing has been sent yet.
   */
  function firstByte(stream, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        stream.off?.('data', onData)
        stream.off?.('end', onEnd)
        stream.off?.('error', onEnd)
        resolve(value)
      }
      const onData = (chunk) => {
        stream.pause?.()
        finish(chunk)
      }
      const onEnd = () => finish(null)
      const timer = setTimeout(() => finish(null), timeoutMs)
      stream.on?.('data', onData)
      stream.on?.('end', onEnd)
      stream.on?.('error', onEnd)
      stream.resume?.()
    })
  }

  /**
   * Hand a real file straight to the page, forwarding byte ranges upstream.
   *
   * The whole point of not transcoding a file is that the browser then owns the
   * timeline: it knows the length from the container and seeks by asking for a
   * byte range, so the page never needs `?start=` for these.
   *
   * Returns `'mp4'` when the response was already written (or is being piped),
   * and `'hls'` when the first bytes say the "mp4" is really an HLS playlist —
   * the caller transcodes that, and must still apply the ADTS→ASC filter.
   */
  async function passthroughOnline(target, headers, request, response) {
    const range = String(request.headers?.range ?? '').trim()
    const upstream = await fetch(target, { headers: range === '' ? headers : { ...headers, range } })
    if (upstream.body === null) throw new Error(`片源返回 HTTP ${upstream.status}`)
    const reader = upstream.body.getReader()
    const first = await reader.read()
    const head = Buffer.from(first.value ?? new Uint8Array())
    if (head.subarray(0, 7).toString('latin1') === '#EXTM3U') {
      await reader.cancel().catch(() => undefined)
      return 'hls'
    }
    if (upstream.ok !== true) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`片源返回 HTTP ${upstream.status}`)
    }
    const out = {
      'content-type': upstream.headers.get('content-type') ?? 'video/mp4',
      'accept-ranges': upstream.headers.get('accept-ranges') ?? 'none',
      'cache-control': 'no-store',
    }
    const contentRange = upstream.headers.get('content-range')
    if (contentRange !== null) out['content-range'] = contentRange
    const contentLength = upstream.headers.get('content-length')
    if (contentLength !== null) out['content-length'] = contentLength
    response.writeHead(upstream.status === 206 ? 206 : 200, out)
    if (first.value !== undefined && first.value.length > 0) response.write(head)
    async function* rest() {
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done === true) break
          if (chunk.value !== undefined && chunk.value.length > 0) yield Buffer.from(chunk.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    }
    Readable.from(rest()).pipe(response)
    response.on('close', () => {
      reader.cancel().catch(() => undefined)
    })
    return 'mp4'
  }

  const onlineStreamRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/online/stream`,
      handler: async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
        const episode = String(url.searchParams.get('episode') ?? '').trim()
        const start = clampInt(url.searchParams.get('start'), 0, 0, 24 * 3600)
        let source = ''
        try {
          source = onlineSource(url.searchParams.get('source'))
        } catch (error) {
          sendJson(response, 200, { ok: false, error: { message: error?.message ?? String(error) } })
          return
        }
        const server = String(url.searchParams.get('server') ?? '').trim()
        // Sources that offer a dub get asked for it; the rest ignore the flag.
        const dub = url.searchParams.get('dub') === '1'
        if (episode === '') {
          sendJson(response, 200, { ok: false, error: { message: '缺少 episode' } })
          return
        }
        try {
          const quality = String(url.searchParams.get('quality') ?? '').trim()
          // A dead line is normal: these sites keep lines that 403 or whose host
          // is long gone, and the first one is not always the good one. Only this
          // route sees the failure and can still answer (nothing is written
          // before the first byte), so a failure walks forward to the next line
          // instead of ending on "播不出来".
          const candidates = await streamCandidates(source, episode, server)
          let result = null
          let first = null
          let lastError = null
          for (const [attempt, candidate] of candidates.entries()) {
            const name = candidate.server
            try {
              const resolved = await resolveOnline(source, candidate.episode, name, dub)
              const { headers, chosen } = resolvedTracks(resolved, quality)
              const target = String(chosen?.url ?? '')
              if (target === '') throw new Error('这一集没有拿到可以播放的地址')
              console.info(
                `[dsh-anime] online stream source=${source} server=${resolved?.server ?? name} type=${chosen?.type ?? '-'} quality=${chosen?.quality ?? '-'} start=${start} try=${attempt + 1}/${candidates.length}`,
              )
              // A plain file is passed through byte for byte: it starts instantly
              // and the browser can seek inside it with a Range request. The type
              // a source declares is a hint, not a fact — AniCh has lines whose
              // URL has no extension and whose body is an HLS playlist — so for
              // anything not explicitly m3u8 the first bytes decide.
              //
              // `start > 0` disables the passthrough on purpose: the byte proxy
              // has no way to skip into the file, so forwarding it would hand the
              // player second 0 while the progress bar claims otherwise. The
              // transcoder can seek (`-ss`), which is what "换线路后从当前位置续播"
              // actually needs — for HLS and for a plain file alike.
              if (
                start === 0 &&
                chosen?.type !== 'm3u8' &&
                (await passthroughOnline(target, headers, request, response)) === 'mp4'
              )
                return
              // What reaches the transcoder is HLS either way, which is why the
              // ADTS→ASC filter applies unconditionally: `type: 'auto'` cannot be
              // trusted to mean "already MP4".
              result = await createTranscodeStream(target, {
                startSeconds: start,
                headers,
                audioBitstreamFilter: 'aac_adtstoasc',
              })
              // Nothing is written until ffmpeg actually produces a frame, so a
              // dead transcode becomes a JSON error (or another line's attempt)
              // instead of a 200 with an empty body — that empty 200 is exactly
              // how "转码没出画面" used to look.
              first = await firstByte(result.stream, 15000)
              if (first !== null) {
                goodLine.set(`${source}|${String(episode ?? '').split('|')[0]}`, name)
                break
              }
              const detail = String(result.stderr?.() ?? '').trim().slice(-400)
              try {
                result.child?.kill()
              } catch {
                /* already gone */
              }
              result = null
              throw new Error(detail === '' ? '转码没有输出任何数据（ffmpeg 没有报错）' : `转码没有出画面：${detail}`)
            } catch (error) {
              lastError = error
              console.warn(`[dsh-anime] online stream 线路「${name}」不可用：`, error?.message ?? error)
            }
          }
          if (result === null || first === null) throw lastError ?? new Error('这一集没有能播的线路')
          response.writeHead(200, {
            'content-type': 'video/mp4',
            'cache-control': 'no-store',
            'accept-ranges': 'none',
          })
          response.write(first)
          result.stream.pipe(response)
          response.on('close', () => {
            try {
              result.child?.kill()
            } catch {
              /* the child is already gone */
            }
          })
          result.stream.on('error', () => {
            try {
              response.destroy()
            } catch {
              /* nothing left to do */
            }
          })
        } catch (error) {
          console.warn(`[dsh-anime] online stream failed source=${source} episode=${episode}:`, error?.message ?? error)
          if (response.headersSent !== true) {
            sendJson(response, 200, { ok: false, error: { message: String(error?.message ?? error) } })
          } else {
            response.destroy()
          }
        }
        },
      })

    // The page greys out rungs it cannot play (login / 大会员) instead of
    // failing on click, which is what bilibili's own popup does.
    register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/bili/qualities`,
      handler: async (request, response) => {
        try {
          const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
          const epId = clampInt(url.searchParams.get('ep_id'), 0, 0, Number.MAX_SAFE_INTEGER)
          const bvid = String(url.searchParams.get('bvid') ?? '').trim()
          const cid = clampInt(url.searchParams.get('cid'), 0, 0, Number.MAX_SAFE_INTEGER)
          const qn = clampInt(url.searchParams.get('qn'), biliQuality(), 16, 127)
          if (cid <= 0 || (epId <= 0 && !/^BV[0-9A-Za-z]+$/.test(bvid))) {
            sendJson(response, 200, { ok: false, error: { message: 'cid plus ep_id or bvid is required' } })
            return
          }
          const resolved = epId > 0 ? await resolvePlay(epId, cid, qn) : await resolveVideoPlay(bvid, cid, qn)
          console.info(
            `[dsh-anime] qualities bvid=${bvid || '-'} ep=${epId || '-'} cid=${cid} -> q=${resolved.quality} formats=${resolved.formats?.length ?? 0} dur=${resolved.duration}`,
          )
          const state = accountStore.load()
          const view = publicAccounts(state)
          sendJson(response, 200, {
            ok: true,
            quality: resolved.quality,
            ladder: Array.isArray(resolved.formats) ? resolved.formats : [],
            duration: resolved.duration ?? null,
            loggedIn: Boolean(view?.bilibili?.loggedIn),
            vip: Boolean(state?.providers?.bilibili?.fields?.vip),
          })
        } catch (error) {
          sendJson(response, 200, { ok: false, error: { message: String(error?.message ?? error) } })
        }
    },
  })

  register({
    path: `${ROUTE_PREFIX}/bili/stream`,
    handler: async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
        const epId = clampInt(url.searchParams.get('ep_id'), 0, 0, Number.MAX_SAFE_INTEGER)
        const cid = clampInt(url.searchParams.get('cid'), 0, 0, Number.MAX_SAFE_INTEGER)
        const qn = clampInt(url.searchParams.get('qn'), biliQuality(), 16, 120)
        const bvid = String(url.searchParams.get('bvid') ?? '').trim()
        if (cid <= 0 || (epId <= 0 && !/^BV[0-9A-Za-z]+$/.test(bvid))) {
          sendJson(response, 200, {
            ok: false,
            error: { message: 'cid plus either ep_id (bangumi) or bvid (upload) is required' },
          })
          return
        }
        const play = epId > 0 ? await resolvePlay(epId, cid, qn) : await resolveVideoPlay(bvid, cid, qn)
        const start = clampInt(url.searchParams.get('start'), 0, 0, 24 * 3600)
        const reload = async () => {
          return epId > 0 ? await resolvePlay(epId, cid, qn, true) : await resolveVideoPlay(bvid, cid, qn, true)
        }
        // BiliPai hands the two DASH tracks to the player and lets it merge
        // them. The browser equivalent is Media Source Extensions, so the
        // manifest below is all the page needs: no ffmpeg, instant start,
        // and the real duration comes from playurl.
        if (url.searchParams.get('format') === 'manifest') {
          if (play.kind !== 'dash' || typeof play.audioUrl !== 'string') {
            sendJson(response, 200, { ok: false, error: { message: 'this source is not DASH' } })
            return
          }
          // One line per (re)start, so a seek is visible in the log exactly
          // like a plain stream request: `manifest start=612`.
          console.info(
            `[dsh-anime] manifest start=${Math.floor(start)} ep=${epId} cid=${cid} qn=${qn} dur=${play.duration ?? 0}`,
          )
          // `start` turns the manifest into a segment beginning at that
          // second: the page restarts MSE there when the user seeks.
          const wrap = (raw, kind = 'video', alternates = []) => {
            const alts = alternates
              .filter((candidate) => typeof candidate === 'string' && candidate !== '')
              .map((candidate) => `&alt=${encodeURIComponent(candidate)}`)
              .join('')
            return `${ROUTE_PREFIX}/bili/dash?type=${kind}${start > 0 ? `&start=${Math.floor(start)}` : ''}&u=${encodeURIComponent(raw)}${alts}`
          }
          sendJson(response, 200, {
            ok: true,
            start: Math.floor(start),
            duration: play.duration ?? null,
            video: wrap(play.videoUrl, 'video', (play.videoCandidates ?? []).slice(1)),
            audio: wrap(play.audioUrl, 'audio'),
            // A native player (mpv) has no cookie/referer plumbing of its own:
            // give it the upstream urls and the headers to send.
            videoRaw: play.videoUrl,
            audioRaw: play.audioUrl,
            videoBackup: (play.videoCandidates ?? []).slice(1),
            videoId: play.videoId ?? null,
            videoCodecid: play.videoCodecid ?? null,
            videoMime: `video/mp4; codecs="${play.videoCodecs || 'avc1.640028'}"`,
            audioMime: `audio/mp4; codecs="${play.audioCodecs || 'mp4a.40.2'}"`,
          })
          return
        }
        await bili.stream(play, request.headers.range, response, start, request, reload)
      } catch (error) {
        try {
          sendFailure(response, error)
        } catch {
          /* the body already started; nothing left to report */
        }
      }
    },
  })

  // Static files the page loads itself (libass wasm for ASS, Anime4K WGSL).
  // The renderer is on dsh-app://, so these have to be served over http with
  // CORS open, otherwise `import()`/Worker cannot reach them.
  const vendorRoot = resolvePath(PLUGIN_ROOT, 'assets', 'vendor')
  register({
    kind: 'prefix',
    // No trailing slash: the host matches a prefix route against the path
    // segments, and a trailing separator makes it register nothing.
    path: `${ROUTE_PREFIX}/vendor`,
    handler: async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
        const relative = decodeURIComponent(url.pathname.slice(`${ROUTE_PREFIX}/vendor/`.length))
        const target = resolvePath(vendorRoot, relative)
        if (!target.startsWith(vendorRoot)) {
          sendJson(response, 403, { ok: false, error: { message: 'path escapes the vendor directory' } })
          return
        }
        const type = MIME_BY_EXTENSION[extname(target).toLowerCase()] ?? 'application/octet-stream'
        response.writeHead(200, {
          'content-type': type,
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=86400',
        })
        createReadStream(target)
          .on('error', () => {
            response.end()
          })
          .pipe(response)
      } catch (error) {
        sendFailure(response, error)
      }
    },
  })

  // The by-prefix route above only answers when the host routes prefixes; the
  // bundles the page must load are registered one path at a time so they work
  // either way. Both are UMD builds that set a global when loaded with a plain
  // <script>, which is how the player pulls them in.
  const serveVendorFile = (relative) => {
    register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/vendor/${relative}`,
      handler: async (request, response) => {
        try {
          const target = resolvePath(vendorRoot, relative)
          if (!target.startsWith(vendorRoot) || !existsSync(target)) {
            sendJson(response, 404, { ok: false, error: { message: `没有这个文件: ${relative}` } })
            return
          }
          const type = MIME_BY_EXTENSION[extname(target).toLowerCase()] ?? 'application/octet-stream'
          // The shader packs are megabytes of minified JS; `dev/compress-vendor.mjs`
          // drops brotli/gzip sidecars next to them and the 9.4 MB one shrinks to
          // 1.4 MB, which is the difference between "reading shader…" and instant.
          const accepts = String(request?.headers?.['accept-encoding'] ?? '')
          let file = target
          let encoding = ''
          if (accepts.includes('br') && existsSync(`${target}.br`)) {
            file = `${target}.br`
            encoding = 'br'
          } else if (accepts.includes('gzip') && existsSync(`${target}.gz`)) {
            file = `${target}.gz`
            encoding = 'gzip'
          }
          const headers = {
            'content-type': type,
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=604800',
            vary: 'accept-encoding',
            etag: `"${PLUGIN_BUILD}-${relative}-${encoding || 'raw'}"`,
            'content-length': String(statSync(file).size),
          }
          if (encoding !== '') headers['content-encoding'] = encoding
          response.writeHead(200, headers)
          createReadStream(file)
            .on('error', () => {
              response.end()
            })
            .pipe(response)
        } catch (error) {
          sendFailure(response, error)
        }
      },
    })
  }
  serveVendorFile('anime4k.js/anime4k.js')
  serveVendorFile('anime4k-webgpu/lib/index.js')

  // One DASH track, proxied so the page gets the Referer bilibili wants.
  // Range headers are passed through: MSE asks for byte ranges while it fills
  // the SourceBuffer, and a seek re-asks rather than restarting the encode.

    const dashRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/bili/dash`,
      handler: async (request, response) => {
        try {
          const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
          const raw = String(url.searchParams.get('u') ?? '')
          if (!/^https?:\/\//.test(raw)) {
            sendJson(response, 400, { ok: false, error: { message: 'u must be an absolute http(s) url' } })
            return
          }
          const reqHeaders = request.headers ?? {}
          const track = url.searchParams.get('type') === 'audio' ? 'audio' : 'video'
          const seekStart = clampInt(url.searchParams.get('start'), 0, 0, 24 * 3600)
          if (seekStart > 0) {
            // Seeking with MSE means "start a new segment here": ffmpeg can jump
            // into the remote m4s and re-emit from that second, which raw byte
            // proxying cannot do.
            const result = await createTranscodeStream(raw, {
              startSeconds: seekStart,
              headers: { referer: BILIBILI_REFERER, 'user-agent': BILIBILI_UA },
              audioOnly: track === 'audio',
            })
            response.writeHead(200, {
              'content-type': track === 'audio' ? 'audio/mp4' : 'video/mp4',
              'cache-control': 'no-store',
              'accept-ranges': 'none',
            })
            response.on('close', () => {
              try {
                result.child?.kill()
              } catch {
                /* already gone */
              }
            })
            result.stream.pipe(response)
            return
          }
          // One representation can sit on a CDN host that answers twice and
          // then goes quiet; the web player walks `backupUrl` in that case.
          // Those alternates arrive as repeated `alt=` params from the manifest.
          const candidates = [raw, ...url.searchParams.getAll('alt').filter((entry) => /^https?:\/\//.test(entry))]
          let upstream = null
          let usedCandidate = raw
          for (const candidate of candidates) {
            try {
              const attempt = await fetch(candidate, {
                headers: {
                  referer: BILIBILI_REFERER,
                  'user-agent': BILIBILI_UA,
                  ...(reqHeaders.range ? { range: String(reqHeaders.range) } : {}),
                },
              })
              if (attempt.status >= 200 && attempt.status < 300) {
                upstream = attempt
                usedCandidate = candidate
                if (candidate !== raw) {
                  console.warn(`[dsh-anime] dash rotated to alternate host ${new URL(candidate).host}`)
                }
                break
              }
              console.warn(`[dsh-anime] dash candidate ${new URL(candidate).host} answered ${attempt.status}`)
              try {
                await attempt.body?.cancel()
              } catch {
                /* nothing to release */
              }
            } catch (error) {
              console.warn(`[dsh-anime] dash candidate ${new URL(candidate).host} failed: ${String(error?.message ?? error)}`)
            }
          }
          if (upstream === null) {
            sendJson(response, 502, { ok: false, error: { message: 'every CDN host for this track refused' } })
            return
          }
          void usedCandidate
          const upstreamType = upstream.headers.get('content-type')
          const fallbackType = track === 'audio' ? 'audio/mp4' : 'video/mp4'
          const headers = {
            'content-type': upstreamType !== null && upstreamType.includes('mp4') ? upstreamType : fallbackType,
            'accept-ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
            'cache-control': 'no-store',
          }
          const length = upstream.headers.get('content-length')
          if (length !== null) headers['content-length'] = length
          const range = upstream.headers.get('content-range')
          if (range !== null) headers['content-range'] = range
          response.writeHead(upstream.status === 206 ? 206 : 200, headers)
          if (upstream.body === null) {
            response.end()
            return
          }
          const reader = upstream.body.getReader()
          const pump = async () => {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              if (!response.write(Buffer.from(value))) {
                await new Promise((resolve) => response.once('drain', resolve))
              }
            }
            response.end()
          }
          response.on('close', () => {
            void reader.cancel().catch(() => {})
          })
          await pump()
        } catch (error) {
          try {
            sendFailure(response, error)
          } catch {
            /* headers already sent */
          }
        }
      },
    })

    /**
     * The dsh-app: scheme hands POST requests to the host as GET, so every
     * mutation also has a GET twin: /action?name=<route>&payload=<json>.
     */
    const actionRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/action`,
      handler: async (request, response) => {
        try {
          const url = new URL(request.url, 'http://local')
          const name = String(url.searchParams.get('name') ?? '')
          const target = postHandlers[name]
          if (target === undefined) {
            sendJson(response, 200, { ok: false, error: { message: `没有 ${name || '(空)'} 这个动作` } })
            return
          }
          const raw = url.searchParams.get('payload') ?? '{}'
          if (raw.length > 1_500_000) {
            sendJson(response, 200, { ok: false, error: { message: '请求体太大，改走 POST' } })
            return
          }
          let body = {}
          try {
            body = raw === '' ? {} : JSON.parse(raw)
          } catch {
            sendJson(response, 200, { ok: false, error: { message: 'payload 不是合法 JSON' } })
            return
          }
          const origin = `${request.headers['x-forwarded-proto'] ?? 'http'}://${request.headers.host ?? 'localhost'}`
          const result = await target(body, { origin })
          sendJson(response, 200, result.ok === false ? result : { ok: true, data: result })
        } catch (error) {
          sendFailure(response, error)
        }
      },
    })

    const postRoutes = Object.entries(postHandlers).map(([name, handler]) =>
      register({
        kind: 'exact',
        path: `${ROUTE_PREFIX}/${name}`,
        handler: async (request, response) => {
          // The desktop shell delivers a page POST as a GET, so a mutation
          // answers both: POST with a JSON body, or GET with ?payload=<json>.
          const method = String(request.method ?? 'GET').toUpperCase()
          if (method !== 'POST' && method !== 'GET') {
            response.writeHead(405, { allow: 'POST, GET' })
            response.end()
            return
          }
          try {
            const body =
              method === 'POST'
                ? { ...payloadFromQuery(request), ...(await readJsonBody(request)) }
                : payloadFromQuery(request)
            const origin = `${request.headers['x-forwarded-proto'] ?? 'http'}://${request.headers.host ?? 'localhost'}`
            const result = await handler(body, { origin })
            sendJson(response, 200, result.ok === false ? result : { ok: true, data: result.data ?? result })
          } catch (error) {
            sendFailure(response, error)
          }
      },
      }),
    )

    /** Raw bytes of one file inside a torrent, Range-capable so `<video>` can seek. */
    const torrentStreamRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/torrent/stream`,
      handler: async (request, response) => {
        try {
          const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
          const hash = String(url.searchParams.get('hash') ?? '').trim()
          const index = clampInt(url.searchParams.get('index'), 0, 0, 100000)
          if (!/^[0-9a-fA-F]{40}$/.test(hash)) {
            sendJson(response, 200, { ok: false, error: { message: 'hash 无效' } })
            return
          }
          const service = await torrents()
          const head = await service.head(hash, index)
          const range = parseRange(request.headers.range, head.size)
          const opened = await service.open(hash, index, range)
          const headers = {
            'content-type': opened.contentType ?? 'video/mp4',
            'accept-ranges': 'bytes',
            'cache-control': 'no-store',
          }
          if (opened.size > 0) headers['content-length'] = String(opened.range.end - opened.range.start + 1)
          if (range !== null) headers['content-range'] = `bytes ${opened.range.start}-${opened.range.end}/${opened.size}`
          response.writeHead(range !== null ? 206 : 200, headers)
          opened.stream.on('error', () => {
            try {
              response.destroy()
            } catch {
              /* already closed */
            }
          })
          response.on('close', () => {
            try {
              opened.stream.destroy()
            } catch {
              /* already gone */
            }
          })
          opened.stream.pipe(response)
        } catch (error) {
          try {
            sendFailure(response, error)
          } catch {
            /* the body already started */
          }
        }
      },
    })

    /**
     * Chapter list for a torrent's chosen file, read by ffprobe from the live
     * stream. bilibili's DASH track has no chapters, so this is the only place
     * the seek bar can draw real marks (seanime's Show Chapter Markers).
     */
    const torrentChaptersRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/torrent/chapters`,
      handler: async (request, response) => {
        try {
          const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
          const hash = String(url.searchParams.get('hash') ?? '').trim()
          const index = clampInt(url.searchParams.get('index'), 0, 0, 100000)
          if (!/^[0-9a-fA-F]{40}$/.test(hash)) {
            sendJson(response, 200, { ok: false, chapters: [], error: { message: 'hash 无效' } })
            return
          }
          const origin = `${request.headers['x-forwarded-proto'] ?? 'http'}://${request.headers.host ?? 'localhost'}`
          const source = `${origin}${ROUTE_PREFIX}/torrent/stream?hash=${hash}&index=${index}`
          const result = await readChapters(source)
          console.log(`[dsh-anime] chapters hash=${hash.slice(0, 8)} index=${index} -> ${result.chapters.length} chapter(s)`)
          sendJson(response, 200, result)
        } catch (error) {
          sendJson(response, 200, { ok: false, chapters: [], error: { message: String(error?.message ?? error) } })
        }
      },
    })

    /**
     * ffmpeg output for releases Chromium cannot decode (x265, AV1, 10-bit).
     * Remuxes when the codecs are already browser-safe, transcodes otherwise.
     */
    const torrentTranscodeRoute = register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/torrent/transcode`,
      handler: async (request, response) => {
        let child = null
        try {
          const url = new URL(request.url ?? '/', 'http://dsh-anime.local')
          const hash = String(url.searchParams.get('hash') ?? '').trim()
          const index = clampInt(url.searchParams.get('index'), 0, 0, 100000)
          const start = Math.max(0, Number(url.searchParams.get('start') ?? 0) || 0)
          if (!/^[0-9a-fA-F]{40}$/.test(hash)) {
            sendJson(response, 200, { ok: false, error: { message: 'hash 无效' } })
            return
          }
          const origin = `${request.headers['x-forwarded-proto'] ?? 'http'}://${request.headers.host ?? 'localhost'}`
          const source = `${origin}${ROUTE_PREFIX}/torrent/stream?hash=${hash}&index=${index}`
          const result = await createTranscodeStream(source, { startSeconds: start })
          child = result.child
          response.writeHead(200, {
            'content-type': 'video/mp4',
            'cache-control': 'no-store',
            'accept-ranges': 'none',
          })
          result.stream.on('error', () => {
            try {
              response.destroy()
            } catch {
              /* already closed */
            }
          })
          response.on('close', () => {
            try {
              child.kill()
            } catch {
              /* already exited */
            }
          })
          result.stream.pipe(response)
        } catch (error) {
          try {
            if (child !== null) child.kill()
            sendFailure(response, error)
          } catch {
            /* the body already started */
          }
        }
      },
    })

    /**
     * Withdraw this instance's handlers, leaving the routes themselves in place:
     * removing them would race the next apply and take the page down with it.
     */
    const disposeAll = () => {
      for (const [routePath, entry] of [...ROUTE_REGISTRY.handlers]) {
        if (entry.owner === instanceToken) ROUTE_REGISTRY.handlers.delete(routePath)
      }
    }

    console.info(
      `[dsh-anime] routes published: ${ROUTE_REGISTRY.handlers.size} handlers, ` +
        `${ROUTE_REGISTRY.paths.size} registered paths, build ${PLUGIN_BUILD}`,
    )

    // cordis 只会回收 effect 的清理函数；直接 register 却不登记清理，插件
    // 热重载时就会撞上 "duplicate exact route"，整张路由表一起失效。
    const scope = hostCtx ?? ctx
    if (typeof scope.effect === 'function') {
      scope.effect(() => () => disposeAll())
      return undefined
    }
    return disposeAll
  })
}

