/**
 * Declarative anime sources.
 *
 * The rules in `assets/sources/animeflow/` come from the AnimeFlow project
 * (`openAnimeFlow/animeFlow-assets`). They are data, not code: each JSON says
 * where things are on a site, using XPath (api 1) or a JSON API with delimiter
 * separated play URLs (api 2). This module turns those rules into online
 * extensions, so adding a source is adding a JSON file.
 *
 * Deliberately absent: danmaku and comments — the user does not want them.
 *
 * api 1 (HTML + XPath)
 *   searchUrl/searchList/searchName/searchLink
 *   lineNames/lineList/episode            (detail page)
 *   play page -> m3u8/mp4 scraped with a regex
 *
 * api 2 (JSON)
 *   searchApiConfig  { request, listPath, namePath, sourcePath }
 *   chapterApiConfig { request, format:'delimited', roadNamesPath,
 *                      roadEpisodesPath, roadSeparator, episodeSeparator,
 *                      fieldSeparator }
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseHtml } from './html.js'
import { selectXPathLoose, textXPathLoose, attrXPathLoose } from './xpath.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const REQUEST_TIMEOUT = 20000

/**
 * The pack only ships rules that answered when it was probed (2026-10-25):
 * girigiri (api 2 JSON), 萌道动漫 and MX动漫 (api 1 HTML). Rules whose sites are
 * anti-crawled, JS-rendered, unreachable, or that hand back a site-specific
 * obfuscated play token were removed rather than shipped half-working.
 */
function ruleId(entry) {
  return String(entry.file ?? '').replace(/\.json$/i, '').toLowerCase()
}

function headersFor(rule) {
  const referer = String(rule.baseUrl ?? '')
  return {
    'user-agent': UA,
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    ...(referer === '' ? {} : { referer }),
  }
}

/** Absolute URL for an href found in a page. */
function absolute(base, href) {
  const raw = String(href ?? '').trim()
  if (raw === '') return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return ''
  }
}

async function fetchText(url, rule) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, { headers: headersFor(rule), signal: controller.signal, redirect: 'follow' })
    if (response.status >= 400) throw new Error(`站点返回 HTTP ${response.status}`)
    return await response.text()
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('站点响应太慢（20 秒没有回应）')
    if (error instanceof Error && error.message.startsWith('站点返回')) throw error
    throw new Error(`连不上站点（${error?.message ?? error}）`)
  } finally {
    clearTimeout(timer)
  }
}

/** Minimal JSONPath: `$.a.b` and `$.a.b[*]`. */
function jsonPick(root, path) {
  const steps = String(path ?? '')
    .replace(/^\$\.?/, '')
    .split('.')
    .filter((step) => step !== '')
  let current = [root]
  for (const step of steps) {
    const many = step.endsWith('[*]')
    const name = many ? step.slice(0, -3) : step
    const next = []
    for (const node of current) {
      if (node === null || node === undefined) continue
      const value = name === '' ? node : node[name]
      if (value === undefined) continue
      if (Array.isArray(value)) next.push(...value)
      else next.push(value)
    }
    current = next
  }
  return current
}

async function apiJson(url, rule) {
  const text = await fetchText(url, rule)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('站点返回的不是 JSON')
  }
}

/* ------------------------------------------------------------------ api 1 */

async function searchHtml(rule, term) {
  const url = String(rule.searchUrl ?? '').replace('{keyword}', encodeURIComponent(term))
  if (url === '') throw new Error('这个源没有配置搜索地址')
  const page = parseHtml(await fetchText(url, rule))
  const items = []
  for (const node of selectXPathLoose([page], rule.searchList)) {
    const title = textXPathLoose([node], rule.searchName).trim()
    const href = absolute(rule.baseUrl, attrXPathLoose([node], rule.searchLink, 'href'))
    if (title === '' || href === '') continue
    items.push({ id: href, title, url: href })
    if (items.length >= 60) break
  }
  return items
}

/** Line names + their episode anchors, from a subject detail page. */
async function htmlLines(rule, detailUrl) {
  const page = parseHtml(await fetchText(detailUrl, rule))
  const names = selectXPathLoose([page], rule.lineNames).map((node) => node.text().trim()).filter((name) => name !== '')
  const panes = selectXPathLoose([page], rule.lineList)
  const lines = []
  for (let index = 0; index < panes.length; index += 1) {
    const anchors = selectXPathLoose([panes[index]], rule.episode)
    if (anchors.length === 0) continue
    lines.push({ name: names[index] ?? `线路${index + 1}`, anchors })
  }
  if (lines.length === 0 && panes.length === 0) {
    // Some themes have no line panes at all; take every play link on the page.
    const anchors = selectXPathLoose([page], "//a[contains(@href,'/play') or contains(@href,'/vod-play') or contains(@href,'/v/')]")
    if (anchors.length > 0) lines.push({ name: '默认', anchors })
  }
  return lines
}

async function episodesHtml(rule, detailUrl) {
  const lines = await htmlLines(rule, detailUrl)
  const episodes = []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    for (let index = 0; index < line.anchors.length; index += 1) {
      const anchor = line.anchors[index]
      const href = absolute(detailUrl, anchor.attr('href'))
      if (href === '') continue
      const label = anchor.text().trim()
      episodes.push({
        id: `${lineIndex}|${href}`,
        number: index + 1,
        title: label === '' ? `第${index + 1}集` : label,
        server: line.name,
      })
    }
  }
  return episodes
}

async function serversHtml(rule, detailUrl) {
  const lines = await htmlLines(rule, detailUrl)
  return lines.map((line, index) => ({ name: line.name, sid: String(index), count: line.anchors.length }))
}

/** Play page -> a direct media URL. */
async function resolveHtml(rule, playUrl) {
  const html = await fetchText(playUrl, rule)
  const player = html.indexOf('player_aaaa')
  if (player >= 0) {
    const start = html.indexOf('{', player)
    if (start >= 0) {
      let depth = 0
      for (let index = start; index < html.length; index += 1) {
        const ch = html[index]
        if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            const json = html.slice(start, index + 1)
            const match = /"url"\s*:\s*"([^"]+)"/.exec(json)
            if (match !== null) {
              const cleaned = decodePlayUrl(match[1])
              if (cleaned !== '') return cleaned
            }
            break
          }
        }
      }
    }
  }
  const direct = /https?:\/\/[^"'\s\\]+?\.(?:m3u8|mp4)[^"'\s\\]*/i.exec(html)
  if (direct !== null) return decodePlayUrl(direct[0])
  throw new Error('这一集没有找到播放地址（可能换源了，换一条线路试试）')
}

function decodePlayUrl(raw) {
  let value = String(raw)
  if (value.includes('%u')) {
    value = value.replace(/%u([0-9a-fA-F]{4})/g, (_all, hex) => String.fromCharCode(parseInt(hex, 16)))
  }
  try {
    value = decodeURIComponent(value)
  } catch {
    /* keep the raw value */
  }
  return value.replace(/\\\//g, '/').trim()
}

/* ------------------------------------------------------------------ api 2 */

function buildApiUrl(config, keyword, source) {
  const request = config?.request ?? {}
  const base = String(request.url ?? '')
  const query = request.query ?? {}
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value).replace('{keyword}', keyword).replace('{source}', source))
  }
  const url = new URL(base)
  for (const [key, value] of params) url.searchParams.set(key, value)
  return url.toString()
}

async function searchJson(rule, term) {
  const config = rule.searchApiConfig
  const url = buildApiUrl(config, term, '')
  const payload = await apiJson(url, rule)
  const items = []
  for (const row of jsonPick(payload, config.listPath)) {
    const title = String(jsonPick(row, config.namePath)[0] ?? '').trim()
    const source = String(jsonPick(row, config.sourcePath)[0] ?? '').trim()
    if (title === '' || source === '') continue
    items.push({ id: source, title, url: source })
    if (items.length >= 60) break
  }
  return items
}

/** Splits the delimited play string into lines of episodes. */
async function jsonLines(rule, source) {
  const config = rule.chapterApiConfig
  const url = buildApiUrl(config, '', source)
  const payload = await apiJson(url, rule)
  const names = jsonPick(payload, config.roadNamesPath).map((value) => String(value).trim())
  const roads = jsonPick(payload, config.roadEpisodesPath).map((value) => String(value))
  const roadSeparator = String(config.roadSeparator ?? '$$$')
  const episodeSeparator = String(config.episodeSeparator ?? '#')
  const fieldSeparator = String(config.fieldSeparator ?? '$')
  const rawRoads = roads.length === 1 && roads[0].includes(roadSeparator) ? roads[0].split(roadSeparator) : roads
  const lines = []
  for (let index = 0; index < rawRoads.length; index += 1) {
    const episodes = []
    for (const chunk of String(rawRoads[index] ?? '').split(episodeSeparator)) {
      const [label, href] = chunk.split(fieldSeparator)
      if (String(href ?? '').trim() === '') continue
      episodes.push({ label: String(label ?? '').trim(), href: String(href).trim() })
    }
    if (episodes.length === 0) continue
    lines.push({ name: names[index] ?? `线路${index + 1}`, episodes })
  }
  return lines
}

async function episodesJson(rule, source) {
  const lines = await jsonLines(rule, source)
  const episodes = []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    for (let index = 0; index < line.episodes.length; index += 1) {
      const entry = line.episodes[index]
      episodes.push({
        id: `${lineIndex}|${source}|${index}`,
        number: index + 1,
        title: entry.label === '' ? `第${index + 1}集` : entry.label,
        server: line.name,
      })
    }
  }
  return episodes
}

async function serversJson(rule, source) {
  const lines = await jsonLines(rule, source)
  return lines.map((line, index) => ({ name: line.name, sid: String(index), count: line.episodes.length }))
}

async function resolveJson(rule, episodeId) {
  const [lineIndexRaw, source, indexRaw] = String(episodeId).split('|')
  const lineIndex = Number(lineIndexRaw)
  const index = Number(indexRaw)
  if (!Number.isInteger(lineIndex) || !Number.isInteger(index)) throw new Error('这一集的编号不合法')
  const lines = await jsonLines(rule, source)
  const line = lines[lineIndex]
  const entry = line?.episodes?.[index]
  if (entry === undefined) throw new Error('这一集没有找到播放地址（可能换源了，换一条线路试试）')
  return entry.href
}

/* --------------------------------------------------------------- registry */

function normalizeMedia(url) {
  const value = String(url ?? '')
  if (/\.m3u8(\?|$)/i.test(value)) return 'm3u8'
  if (/\.mp4(\?|$)/i.test(value)) return 'mp4'
  return 'unknown'
}

/**
 * Reads the pack and returns one extension definition per rule.
 * `dir` is `assets/sources/animeflow`.
 */
export function loadWebSources(dir) {
  const indexPath = join(dir, 'index.json')
  if (!existsSync(indexPath)) return []
  let index
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'))
  } catch {
    return []
  }
  const listed = Array.isArray(index.sources) ? index.sources : []
  if (listed.length > 0) {
    return listed.map((entry) => {
      const file = join(dir, String(entry.file))
      const rule = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
      return { id: ruleId(entry), name: String(entry.name ?? ruleId(entry)), api: String(entry.api ?? rule?.api ?? '1'), base: String(entry.base ?? rule?.baseUrl ?? ''), rule }
    })
  }
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'index.json')
    .map((file) => {
      const rule = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      return { id: ruleId({ file }), name: String(rule.name ?? ruleId({ file })), api: String(rule.api ?? '1'), base: String(rule.baseUrl ?? ''), rule }
    })
}

/** Builds the handlers for one rule. */
function handlersFor(rule, api) {
  if (api === '2') {
    return {
      search: async ({ term }) => searchJson(rule, String(term ?? '')),
      episodes: async ({ id }) => episodesJson(rule, String(id ?? '')),
      servers: async ({ id }) => serversJson(rule, String(id ?? '')),
      resolve: async ({ episodeId }) => {
        const url = await resolveJson(rule, episodeId)
        return { url, type: normalizeMedia(url), headers: headersFor(rule) }
      },
    }
  }
  return {
    search: async ({ term }) => searchHtml(rule, String(term ?? '')),
    episodes: async ({ id }) => episodesHtml(rule, String(id ?? '')),
    servers: async ({ id }) => serversHtml(rule, String(id ?? '')),
    resolve: async ({ episodeId }) => {
      const [, href] = String(episodeId).split('|')
      const url = await resolveHtml(rule, href === undefined ? String(episodeId) : href)
      return { url, type: normalizeMedia(url), headers: headersFor(rule) }
    },
  }
}

/**
 * Registers every source in the pack as an `online` extension.
 * Sources that did not answer when the pack was probed are switched off the
 * first time they are seen, so a broken site does not clutter the picker.
 */
export function registerWebSources({ registry, dir, log = () => {} }) {
  const sources = loadWebSources(dir)
  let registered = 0
  for (const source of sources) {
    try {
      const rule = source.rule
      if (rule === null) {
        log(`${source.id}: 规则文件缺失，跳过`)
        continue
      }
      const api = source.api
      if (api !== '1' && api !== '2') {
        log(`${source.id}: api ${api} 还不支持，跳过`)
        continue
      }
      const id = `src-${source.id}`
      const manifest = {
        id,
        name: source.name,
        type: 'online',
        version: String(rule.version ?? '1.0.0'),
        author: 'AnimeFlow sources',
        lang: 'zh',
        description: `${source.name}（${api === '2' ? 'JSON' : 'HTML'} 规则）—— 由 AnimeFlow 声明式源规则驱动。`,
        website: String(rule.baseUrl ?? source.base ?? ''),
        ...(rule.iconUrl === undefined ? {} : { icon: String(rule.iconUrl) }),
        timeoutMs: 25000,
        settings: [],
        dub: false,
        // 声明式源也是「插件」：新用户装完只留 AniList，这些由用户自己在「片源」里打开。
        defaultEnabled: false,
      }
      registry.register({ manifest, handlers: handlersFor(rule, api) })
      registered += 1
    } catch (error) {
      log(`${source.id}: 注册失败（${error?.message ?? error}）`)
    }
  }
  log(`web sources: ${registered}/${sources.length} registered`)
  return registered
}
