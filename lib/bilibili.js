/**
 * Bilibili client: the account cookie jar, WBI signing, the playurl ladder and
 * the DASH/mux/seek plumbing that turns a pair of remote tracks into bytes.
 *
 * It used to live inside index.js. Everything it needed from there now arrives
 * through `deps`, so this file can be read (and registered as a source) on its
 * own; the routes in index.js only call `bili.*`.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, renameSync, statSync, createReadStream, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { httpJson, renderQr } from './accounts.js'
// `dashStream` shells out to ffmpeg to mux the two DASH tracks into one file.
// It used to call a host-provided helper that never reached this module, so
// every plain `<video>` playback died with "findFfmpeg is not defined" — the
// page itself never noticed, because it plays through the MSE manifest, which
// does not mux.
import { findFfmpeg } from './torrent-engine.js'

export const BILIBILI_API = 'https://api.bilibili.com'
export const BILIBILI_REFERER = 'https://www.bilibili.com/'
// The web player's UA matters: some endpoints answer a downgraded ladder
// without it, and `412` without a plausible host.
export const BILIBILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Seconds arrive as numbers or numeric strings; anything else is a zero. */
const toInt = (raw, fallback = 0) => {
  const value = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(value) ? value : fallback
}

/**
 * Bilibili client: one cookie jar (buvid3/buvid4), one UA, one Referer.
 *
 * `x/web-interface/search` answers 412 without a fingerprint cookie, so the
 * cookie is fetched lazily and refreshed once when bilibili complains.
 */
export function createBilibili(deps) {
  const { routePrefix, accountCookie, combineCookie, mixinKey, signQuery, resolvePath, createTranscodeStream } = deps
  const ROUTE_PREFIX = routePrefix
  // Read lazily: a login can happen while the plugin is running.
  const ACCOUNT = {
    get bilibili() {
      return accountCookie()
    },
  }

  let jar = { at: 0, value: '' }

  async function raw(path, params, extraHeaders = {}) {
    const query = new URLSearchParams(params)
    const url = `${BILIBILI_API}${path}?${query.toString()}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': BILIBILI_UA,
          referer: BILIBILI_REFERER,
          origin: 'https://www.bilibili.com',
          accept: 'application/json, text/plain, */*',
          ...(combineCookie(jar.value, ACCOUNT.bilibili) === ''
            ? {}
            : { cookie: combineCookie(jar.value, ACCOUNT.bilibili) }),
          ...extraHeaders,
        },
      })
      const text = await response.text()
      let payload = null
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
      return { status: response.status, payload }
    } finally {
      clearTimeout(timer)
    }
  }

  /** WBI keys are stable for a day; keep them until the call fails. */
  let wbiCache = { at: 0, mixin: '' }
  async function wbiMixin(force = false) {
    if (!force && wbiCache.mixin !== '' && Date.now() - wbiCache.at < 60 * 60 * 1000) return wbiCache.mixin
    const payload = (await raw('/x/web-interface/nav', {})).payload
    const img = payload?.data?.wbi_img?.img_url ?? ''
    const sub = payload?.data?.wbi_img?.sub_url ?? ''
    const mixin = mixinKey(img, sub)
    if (mixin === '') throw new Error('拿不到 WBI 签名所需的 key')
    wbiCache = { at: Date.now(), mixin }
    return mixin
  }

  /** GET a WBI-signed endpoint (falls back to unsigned params if signing dies). */
  async function callSigned(path, params) {
    let mixin
    try {
      mixin = await wbiMixin()
    } catch {
      mixin = ''
    }
    if (mixin === '') return call(path, params)
    const query = signQuery(params, mixin)
    const result = await raw(`${path}?${query}`, {})
    const payload = result.payload
    if (result.status < 400 && payload?.code === 0) return payload.result ?? payload.data
    // Keys can rotate mid-session: re-sign once with a fresh pair.
    const fresh = await wbiMixin(true)
    const retry = await raw(`${path}?${signQuery(params, fresh)}`, {})
    const retryPayload = retry.payload
    if (retry.status < 400 && retryPayload?.code === 0) return retryPayload.result ?? retryPayload.data
    throw new Error(`bilibili: ${retryPayload?.message ?? retryPayload?.msg ?? `code ${retryPayload?.code}`}`)
  }

  async function ensureCookie(force = false) {
    if (!force && jar.value !== '' && Date.now() - jar.at < 12 * 60 * 60 * 1000) return jar.value
    try {
      const { payload } = await raw('/x/frontend/finger/spi', {})
      const b3 = payload?.data?.b_3 ?? ''
      const b4 = payload?.data?.b_4 ?? ''
      jar = { at: Date.now(), value: b3 === '' ? '' : `buvid3=${b3}; buvid4=${b4}` }
    } catch {
      jar = { at: Date.now(), value: '' }
    }
    return jar.value
  }

  /** GET a JSON endpoint, retrying once with a fresh fingerprint on 412. */
  async function call(path, params) {
    await ensureCookie()
    let attempt = await raw(path, params)
    const blocked = (result) =>
      result.status === 412 || result.payload?.code === -352 || result.payload?.code === -401
    if (blocked(attempt)) {
      await ensureCookie(true)
      attempt = await raw(path, params)
    }
    if (blocked(attempt)) throw new Error('bilibili 拒绝了这次请求（412 风控），稍后重试')
    if (attempt.status >= 400) throw new Error(`bilibili 响应 ${attempt.status}`)
    const payload = attempt.payload
    if (payload === null) throw new Error('bilibili 返回了非 JSON 响应')
    if (payload.code !== 0) {
      throw new Error(`bilibili: ${payload.message ?? payload.msg ?? `code ${payload.code}`}`)
    }
    return payload.result ?? payload.data
  }

  // bilibili hands titles back with the highlight tags *and* HTML entities
  // inside them (`進撃の巨人 OP&amp;ED`), so both have to go or the entity shows
  // up verbatim in the grid.
  const stripTags = (value) =>
    String(value ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  const fixUrl = (value) => {
    const text = String(value ?? '')
    if (text === '') return null
    if (text.startsWith('//')) return `https:${text}`
    if (text.startsWith('http://')) return `https://${text.slice(7)}`
    return text.startsWith('https://') ? text : null
  }

  /** Bangumi search on bilibili — the match step for every AniList title. */
  async function search(term) {
    const data = await call('/x/web-interface/search/type', {
      search_type: 'media_bangumi',
      keyword: term,
      page: 1,
    })
    const list = Array.isArray(data?.result) ? data.result : []
    return list
      .map((item) => ({
        seasonId: Number(item?.season_id) || null,
        title: stripTags(item?.title),
        cover: fixUrl(item?.cover),
        episodes: item?.ep_size ?? null,
        score: typeof item?.media_score?.score === 'number' ? item.media_score.score : null,
        styles: String(item?.styles ?? '').split(',').filter((part) => part !== '').slice(0, 4),
        areas: String(item?.areas ?? ''),
        year: String(item?.start_date ?? '').slice(0, 4),
        indexShow: stripTags(item?.index_show),
      }))
      .filter((item) => item.seasonId !== null)
  }

  /** A season with its real episode list, which is what the grid renders. */
  async function season(seasonId) {
    const data = await call('/pgc/view/web/season', { season_id: seasonId })
    const episodes = Array.isArray(data?.episodes) ? data.episodes : []
    const normalized = episodes
      .map((episode, index) => ({
        index: index + 1,
        epId: episode?.id ?? null,
        cid: episode?.cid ?? null,
        bvid: episode?.bvid ?? null,
        label: stripTags(episode?.title ?? '') || String(index + 1),
        longTitle: stripTags(episode?.long_title ?? ''),
        cover: fixUrl(episode?.cover),
        duration: episode?.duration ?? null,
        badge: stripTags(episode?.badge ?? ''),
        link: typeof episode?.link === 'string' ? episode.link : null,
      }))
      .filter((episode) => episode.epId !== null && episode.cid !== null)
    return {
      seasonId: Number(data?.season_id ?? seasonId),
      title: stripTags(data?.season_title ?? data?.title ?? ''),
      cover: fixUrl(data?.cover),
      banner: fixUrl(data?.bkg_cover ?? '') ?? fixUrl(data?.cover),
      evaluate: stripTags(data?.evaluate ?? ''),
      rating: typeof data?.rating?.score === 'number' ? data.rating.score : null,
      total: typeof data?.total === 'number' ? data.total : normalized.length,
      published: normalized.filter((episode) => episode.badge === '').length,
      episodes: normalized,
      rights: {
        areaLimit: data?.rights?.area_limit ?? 0,
        isPreview: data?.rights?.is_preview ?? 0,
      },
    }
  }

  /**
   * The playable streams for one episode.
   *
   * `fnval: 1` (progressive MP4) is what a plain `<video>` wants, but bilibili
   * caps it at 720P even for a logged-in account — asking for 1080P returned
   * `quality: 64` with `accept_quality: [64, 16]`, which is exactly the "still
   * blurry after login" report. DASH (`fnval: 4048`) carries the real 1080P
   * video, at the price of being video-only: the page cannot mux it, so the
   * Host hands both URLs to ffmpeg and pipes back one file (see `dashStream`).
   */
  /**
   * 125/126/127 are HDR / Dolby Vision: a plain <video> shows them washed out
   * or not at all, so only the SDR ladder is considered.
   */
  const SDR_QUALITIES = new Set([6, 16, 32, 64, 74, 80, 112])

  /** Highest SDR video rung plus the best audio track from a playurl payload. */
  /**
   * Every DASH representation playurl handed back, best first, keeping the
   * `backupUrl` list: the web player rotates through those hosts when one CDN
   * stalls, which is why a dying host does not stop the site for it.
   */
  function dashRepresentations(data) {
    const videos = Array.isArray(data?.dash?.video) ? data.dash.video : []
    return videos
      .filter((entry) => typeof entry?.baseUrl === 'string' && entry.baseUrl !== '')
      .map((entry) => ({
        id: Number(entry?.id ?? 0),
        codecid: Number(entry?.codecid ?? 0),
        codecs: String(entry?.codecs ?? ''),
        height: Number(entry?.height ?? 0),
        frameRate: String(entry?.frameRate ?? ''),
        bandwidth: Number(entry?.bandwidth ?? 0),
        baseUrl: entry.baseUrl,
        backups: (Array.isArray(entry?.backupUrl) ? entry.backupUrl : []).filter(
          (candidate) => typeof candidate === 'string' && candidate !== '',
        ),
      }))
      .sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth)
  }

  /**
   * Pick by quality id, not by height: one height ships as several codec ids
   * (30232 = 1080P60, 30080 = 1080P) and only some survive a long play.
   */
  function pickDashStream(data, preferId = 0) {
    const videos = dashRepresentations(data)
    const audios = Array.isArray(data?.dash?.audio) ? data.dash.audio : []
    const wanted = Number(preferId) > 0 ? Number(preferId) : 0
    const best =
      videos.find((entry) => entry.id === wanted) ??
      videos.find((entry) => wanted > 0 && entry.id <= wanted) ??
      videos[0]
    const audio = audios
      .filter((entry) => typeof entry?.baseUrl === 'string')
      .sort((a, b) => Number(b.bandwidth) - Number(a.bandwidth))[0]
    return { best, audio, videos }
  }

  /**
   * Not every account may ask for every quality: bilibili answers a 1080P+ or
   * 4K request from a non-VIP with -10403 and no dash at all. Walk down the
   * ladder instead of failing, so the episode still plays (BiliPai does the
   * same before it greys a quality out).
   */
  async function pgcPlayurlWithFallback(epId, cid, qn) {
    const ladder = [qn, ...[112, 80, 74, 64, 32, 16].filter((value) => value < qn)]
    let lastError = null
    for (const candidate of ladder) {
      try {
        return await call('/pgc/player/web/playurl', {
          ep_id: epId,
          cid,
          qn: candidate,
          fnval: 4048,
          fourk: 1,
        })
      } catch (error) {
        lastError = error
        const message = String(error?.message ?? error)
        if (!/会员|权限|10403|87007|87008|-404/.test(message)) throw error
        console.warn(`[dsh-anime] pgc playurl qn=${candidate} refused (${message}), trying lower`)
      }
    }
    throw lastError ?? new Error('这一话没有可播放的地址')
  }

  async function playurl(epId, cid, qn) {
    const data = await pgcPlayurlWithFallback(epId, cid, qn)
    const first = Array.isArray(data?.durl) ? data.durl[0] : null
    const { best, audio, videos } = pickDashStream(data, qn)
    console.info(
      `[dsh-anime] pgc playurl ep=${epId} cid=${cid} qn=${qn} -> quality=${best?.id ?? data?.quality} height=${best?.height ?? '-'} ladder=${JSON.stringify(data?.accept_quality ?? [])}`,
    )
    const dashUrl = typeof best?.baseUrl === 'string' && best.baseUrl !== '' ? best.baseUrl : null
    const url = dashUrl ?? first?.url ?? null
    if (typeof url !== 'string' || url === '') {
      throw new Error('这一话没有可播放的地址（可能只有大会员或地区限制才能看）')
    }
    return {
      url,
      videoUrl: dashUrl,
      audioUrl: audio?.baseUrl ?? null,
      videoCodecs: String(best?.codecs ?? ''),
      audioCodecs: String(audio?.codecs ?? ''),
      quality: best?.id ?? data?.quality ?? null,
      videoId: best?.id ?? null,
      videoCodecid: best?.codecid ?? null,
      videoCodecsSeen: videos.map((entry) => entry.id),
      // `[baseUrl, ...backupUrl]`: the proxy rotates through these when one CDN
      // host stops answering, the way the web player does.
      videoCandidates: best === undefined ? [] : [best.baseUrl, ...best.backups],
      height: best?.height ?? null,
      size: first?.size ?? null,
      duration:
        Number(data?.timelength) > 0
          ? Math.round(Number(data.timelength) / 1000)
          : Number(data?.dash?.duration) > 0
            ? Math.round(Number(data.dash.duration))
            : null,
      formats: Array.isArray(data?.accept_quality) ? data.accept_quality : [],
      kind: dashUrl === null ? (first === null ? 'video-only' : 'mp4') : audio === undefined ? 'video-only' : 'dash',
      expiresHint: '需要 Referer 才能取到字节，所以由 Host 代取',
    }
  }

  /**
   * User-uploaded videos (投稿视频). Bilibili keeps these in a different world
   * from bangumi: `search_type=video` for discovery, `x/web-interface/view`
   * for the metadata and part list, `x/player/playurl` for the file.
   */
  async function searchVideos(term, page = 1) {
    const data = await call('/x/web-interface/search/type', {
      search_type: 'video',
      keyword: term,
      page,
    })
    const list = Array.isArray(data?.result) ? data.result : []
    return {
      term,
      page: Number(data?.page) || page,
      total: Number(data?.numResults) || list.length,
      items: list
        .map((item) => ({
          bvid: String(item?.bvid ?? ''),
          title: stripTags(item?.title),
          cover: fixUrl(item?.pic),
          author: stripTags(item?.author),
          duration: stripTags(item?.duration),
          play: Number(item?.play) || 0,
          danmaku: Number(item?.video_review) || 0,
          pubdate: Number(item?.pubdate) || 0,
          tag: stripTags(item?.tag),
        }))
        .filter((item) => /^BV[0-9A-Za-z]+$/.test(item.bvid)),
    }
  }

  /** One upload, with every part (分P) and its cid so the grid can play them. */
  async function video(bvid) {
    const data = await call('/x/web-interface/view', { bvid })
    if (data === null || typeof data !== 'object') throw new Error('这个视频不存在或已失效')
    const pages = Array.isArray(data?.pages) ? data.pages : []
    return {
      bvid: String(data?.bvid ?? bvid),
      aid: data?.aid ?? null,
      title: stripTags(data?.title),
      cover: fixUrl(data?.pic),
      desc: stripTags(data?.desc),
      owner: stripTags(data?.owner?.name),
      ownerFace: fixUrl(data?.owner?.face),
      duration: Number(data?.duration) || 0,
      pubdate: Number(data?.pubdate) || 0,
      stat: {
        view: Number(data?.stat?.view) || 0,
        danmaku: Number(data?.stat?.danmaku) || 0,
        reply: Number(data?.stat?.reply) || 0,
        like: Number(data?.stat?.like) || 0,
        coin: Number(data?.stat?.coin) || 0,
        favorite: Number(data?.stat?.favorite) || 0,
      },
      pages: pages
        .map((part, index) => ({
          page: Number(part?.page) || index + 1,
          cid: Number(part?.cid) || null,
          part: stripTags(part?.part) || `P${index + 1}`,
          duration: Number(part?.duration) || 0,
        }))
        .filter((part) => part.cid !== null),
    }
  }

  /**
   * One part of an upload. Uploads answer `fnval: 1` with a 720P-capped
   * progressive file as well, so the same DASH ladder is requested here and the
   * audio track is muxed in by `dashStream` — otherwise a 1080P upload played
   * through the page looked blurry while its own player showed it sharp.
   */
  /**
   * bilibili signs playurl with WBI (`w_rid` = md5(sorted params + mixin key)).
   * BiliPai signs every playurl; unsigned requests get a throttled, worse CDN
   * entry (mcdn / -30080) which is the one that keeps dying mid-playback.
   */
  let wbiKeys = null
  async function wbiMixin() {
    if (wbiKeys !== null && Date.now() - wbiKeys.at < 60 * 60 * 1000) return wbiKeys.mixin
    try {
      const nav = await call('/x/web-interface/nav', {})
      const img = String(nav?.data?.wbi_img?.img_url ?? '')
      const sub = String(nav?.data?.wbi_img?.sub_url ?? '')
      const pick = (url) => url.slice(url.lastIndexOf('/') + 1, url.lastIndexOf('.'))
      const raw = `${pick(img)}${pick(sub)}`
      const order = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
      let mixin = ''
      for (const index of order) mixin += raw[index] ?? ''
      wbiKeys = { at: Date.now(), mixin }
      return mixin
    } catch {
      wbiKeys = { at: Date.now(), mixin: null }
      return null
    }
  }

  async function wbiSigned(path, params) {
    const mixin = await wbiMixin()
    if (mixin === null) return { path, params }
    const wts = Math.floor(Date.now() / 1000).toString()
    const table = { ...params, wts }
    const query = Object.keys(table)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(table[key]).replace(/[!'()*]/g, ''))}`)
      .join('&')
    const rid = createHash('md5').update(query + mixin).digest('hex')
    return { path, params: { ...table, w_rid: rid } }
  }

  async function playVideo(bvid, cid, qn) {
    const ladder = [qn, ...[112, 80, 74, 64, 32, 16].filter((value) => value < qn)]
    let data = null
    let lastError = null
    for (const candidate of ladder) {
      try {
        const signed = await wbiSigned('/x/player/wbi/playurl', {
          bvid,
          cid,
          qn: candidate,
          fnval: 4048,
          fnver: 0,
          fourk: 1,
        })
        data = await call(signed.path, signed.params)
        if (candidate !== qn) console.warn(`[dsh-anime] video playurl fell back to qn=${candidate}`)
        break
      } catch (error) {
        lastError = error
        const message = String(error?.message ?? error)
        if (!/会员|权限|10403|87007|87008|-404/.test(message)) throw error
        console.warn(`[dsh-anime] video playurl qn=${candidate} refused (${message}), trying lower`)
      }
    }
    if (data === null) throw lastError ?? new Error('这个视频没有可播放的地址')
    const first = Array.isArray(data?.durl) ? data.durl[0] : null
    const { best, audio, videos } = pickDashStream(data, qn)
    console.info(
      `[dsh-anime] video playurl bvid=${bvid} cid=${cid} qn=${qn} -> pick id=${best?.id ?? '-'} codecid=${best?.codecid ?? '-'} h=${best?.height ?? '-'} backups=${best?.backups?.length ?? 0} reps=${JSON.stringify(videos.map((entry) => entry.id))} ladder=${JSON.stringify(data?.accept_quality ?? [])}`,
    )
    const dashUrl = typeof best?.baseUrl === 'string' && best.baseUrl !== '' ? best.baseUrl : null
    const url = dashUrl ?? first?.url ?? null
    if (typeof url !== 'string' || url === '') {
      throw new Error('这个视频没有可播放的地址（可能需要登录，或作者限制了播放）')
    }
    return {
      url,
      videoUrl: dashUrl,
      audioUrl: audio?.baseUrl ?? null,
      videoCodecs: String(best?.codecs ?? ''),
      audioCodecs: String(audio?.codecs ?? ''),
      quality: best?.id ?? data?.quality ?? null,
      videoId: best?.id ?? null,
      videoCodecid: best?.codecid ?? null,
      videoCodecsSeen: videos.map((entry) => entry.id),
      // `[baseUrl, ...backupUrl]`: the proxy rotates through these when one CDN
      // host stops answering, the way the web player does.
      videoCandidates: best === undefined ? [] : [best.baseUrl, ...best.backups],
      height: best?.height ?? null,
      size: first?.size ?? null,
      duration:
        Number(data?.timelength) > 0
          ? Math.round(Number(data.timelength) / 1000)
          : Number(data?.dash?.duration) > 0
            ? Math.round(Number(data.dash.duration))
            : null,
      formats: Array.isArray(data?.accept_quality) ? data.accept_quality : [],
      kind: dashUrl === null ? (first === null ? 'video-only' : 'mp4') : audio === undefined ? 'video-only' : 'dash',
      expiresHint: '需要 Referer 才能取到字节，所以由 Host 代取',
    }
  }

  /** Stream one resolved URL back, forwarding Range so seeking works. */
  /**
   * DASH is video-only plus a separate audio track; nothing in the page can
   * mux that, so ffmpeg does `-c copy` into a fragmented MP4 and we pipe it.
   * Copy, never re-encode: 1080P arrives as-is and the CPU stays idle.
   */
  /**
   * Mux one DASH pair into a real file once, then serve it with Range.
   *
   * Piping `-movflags frag_keyframe+empty_moov` looked like it worked, but an
   * empty moov carries no total duration: Chromium reported the first fragment
   * (~9 s) and stopped, and nothing could be seeked. Muxing to a file gives a
   * moov with `mvhd.duration`, so the page shows the real length and a Range
   * request can jump anywhere. The result is cached per stream identity, so a
   * seek never starts a second ffmpeg.
   */
  const dashFiles = new Map()
  const dashDir = resolvePath(tmpdir(), 'dsh-anime-mux')
  function muxPathFor(play) {
    const hash = createHash('sha1')
      .update(`${play.videoUrl}|${play.audioUrl}`)
      .digest('hex')
      .slice(0, 20)
    return resolvePath(dashDir, `${hash}.mp4`)
  }
  async function muxCacheStats() {
    let files = 0
    let bytes = 0
    try {
      const names = await readdir(dashDir)
      for (const name of names) {
        const stats = await stat(resolvePath(dashDir, name)).catch(() => null)
        if (stats?.isFile()) {
          files += 1
          bytes += stats.size
        }
      }
    } catch {}
    return { dir: dashDir, files, bytes }
  }
  /**
   * Delete the merge cache. Files that a running stream still owns are left
   * alone: on Windows an open file cannot be removed, and a half-written
   * `.part` would break the ffmpeg that is filling it.
   */
  async function clearMuxCache() {
    let removed = 0
    let bytes = 0
    let skipped = 0
    const busy = new Set([...dashFiles.keys(), ...liveFiles.keys()])
    try {
      const names = await readdir(dashDir)
      for (const name of names) {
        const full = resolvePath(dashDir, name)
        const stats = await stat(full).catch(() => null)
        if (!stats?.isFile()) continue
        if (name.endsWith('.part') || busy.has(full)) {
          skipped += 1
          continue
        }
        const ok = await rm(full, { force: true })
          .then(() => true)
          .catch(() => false)
        if (!ok) {
          skipped += 1
          continue
        }
        removed += 1
        bytes += stats.size
      }
    } catch {}
    for (const key of [...dashFiles.keys()]) {
      if (!existsSync(key)) dashFiles.delete(key)
    }
    return { removed, bytes, skipped }
  }
  async function dashFile(play, reload = null) {
    const target = muxPathFor(play)
    const pending = dashFiles.get(target)
    if (pending !== undefined) return pending
    const job = (async () => {
      if (existsSync(target) && statSync(target).size > 0) return target
      const ffmpeg = await findFfmpeg()
      if (ffmpeg === null) throw new Error('没有找到 ffmpeg，无法合并 DASH 音视频；请安装 ffmpeg 或改用种子源')
      mkdirSync(dashDir, { recursive: true })
      const temp = `${target}.part`
      const headers = `Referer: ${BILIBILI_REFERER}\r\nUser-Agent: ${BILIBILI_UA}\r\n`
      const buildArgs = (source) => [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-y',
        '-headers', headers, '-i', source.videoUrl,
        ...(typeof source.audioUrl === 'string' ? ['-headers', headers, '-i', source.audioUrl] : []),
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-c', 'copy',
        '-movflags', '+faststart',
        '-f', 'mp4',
        temp,
      ]
      const runOnce = (source) => new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(ffmpeg, buildArgs(source), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (chunk) => {
          stderr += String(chunk)
          if (stderr.length > 4000) stderr = stderr.slice(-4000)
        })
        child.on('error', rejectPromise)
        child.on('exit', (code) => {
          if (code === 0) resolvePromise()
          else rejectPromise(new Error(`DASH 合并失败（ffmpeg ${code}）：${stderr.trim().slice(-300)}`))
        })
      })
      const started = Date.now()
      try {
        await runOnce(play)
      } catch (first) {
        // A signed url that ran past its `deadline` is the usual cause: ask the
        // caller for a fresh playurl and mux once more before giving up.
        if (typeof reload !== 'function') throw first
        console.warn(`[dsh-anime] DASH mux retry: ${String(first.message).slice(-140)}`)
        const fresh = await reload()
        if (fresh === null || typeof fresh.videoUrl !== 'string') throw first
        play = fresh
        await runOnce(fresh)
      }
      renameSync(temp, target)
      console.log(`[dsh-anime] DASH mux ${Math.round((Date.now() - started) / 1000)}s -> ${target}`)
      return target
    })().catch((error) => {
      dashFiles.delete(target)
      throw error
    })
    dashFiles.set(target, job)
    return job
  }

  /** Fragmented file that ffmpeg grows on disk: safe to read while it runs. */
  const liveFiles = new Map()

  function livePathFor(play, startSeconds) {
    const hash = createHash('sha1')
      .update(`${play.videoUrl}|${play.audioUrl}|${startSeconds > 0 ? `s${Math.floor(startSeconds)}` : 'full'}`)
      .digest('hex')
      .slice(0, 20)
    return resolvePath(dashDir, `${hash}.live.mp4`)
  }

  function startLive(play, startSeconds, reload = null) {
    const target = livePathFor(play, startSeconds)
    const running = liveFiles.get(target)
    if (running !== undefined) return { target, done: running }
    const done = (async () => {
      try {
        if (existsSync(target) && statSync(target).size > 0) return target
        const ffmpeg = await findFfmpeg()
        if (ffmpeg === null) throw new Error('没有找到 ffmpeg')
        mkdirSync(dashDir, { recursive: true })
        const headers = `Referer: ${BILIBILI_REFERER}\r\nUser-Agent: ${BILIBILI_UA}\r\n`
        const seekArgs = startSeconds > 0 ? ['-ss', String(Math.floor(startSeconds))] : []
        const args = [
          '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
          ...seekArgs,
          '-headers', headers, '-i', play.videoUrl,
          ...(typeof play.audioUrl === 'string' ? ['-headers', headers, '-i', play.audioUrl] : []),
          '-map', '0:v:0', '-map', '1:a:0?',
          '-c', 'copy',
          '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4',
          target,
        ]
        const run = (source) => {
          const seek = startSeconds > 0 ? ['-ss', String(Math.floor(startSeconds))] : []
          const argv = args.slice(0, 4).concat(seek, args.slice(4 + (seek.length > 0 ? 2 : 0)))
          return new Promise((resolvePromise, rejectPromise) => {
            const child = spawn(ffmpeg, argv, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
            let stderr = ''
            child.stderr.on('data', (chunk) => {
              stderr += String(chunk)
              if (stderr.length > 2000) stderr = stderr.slice(-2000)
            })
            child.on('error', rejectPromise)
            child.on('exit', (code) => {
              if (code === 0) resolvePromise()
              else rejectPromise(new Error(`live mux ${code}: ${stderr.trim().slice(-200)}`))
            })
          })
        }
        try {
          await run(play)
        } catch (first) {
          // An expired signed url is the usual cause; one fresh attempt fixes it.
          if (typeof reload !== 'function') throw first
          console.warn(`[dsh-anime] live mux retry: ${String(first.message).slice(-160)}`)
          const fresh = await reload()
          if (fresh === null || typeof fresh.videoUrl !== 'string') throw first
          try {
            rmSync(target, { force: true })
          } catch {
            /* nothing there */
          }
          await run(fresh)
        }
        return target
      } finally {
        setTimeout(() => liveFiles.delete(target), 5000).unref?.()
      }
    })()
    liveFiles.set(target, done)
    return { target, done }
  }

  /** Stream a file that is still being written, following it as it grows. */
  function serveGrowing(target, done, response) {
    response.writeHead(200, {
      'content-type': 'video/mp4',
      'cache-control': 'no-store',
      'accept-ranges': 'none',
    })
    let offset = 0
    let finished = false
    let closed = false
    done.then(() => { finished = true }).catch(() => { finished = true })
    response.on('close', () => { closed = true })
    const pump = () => {
      if (closed) return
      let size = 0
      try {
        size = existsSync(target) ? statSync(target).size : 0
      } catch {
        size = 0
      }
      if (size <= offset) {
        if (finished) {
          if (!closed) response.end()
          return
        }
        setTimeout(pump, 250)
        return
      }
      const stream = createReadStream(target, { start: offset, end: size - 1 })
      offset = size
      stream.on('data', (chunk) => { if (!closed) response.write(chunk) })
      stream.on('end', () => {
        if (closed) return
        setTimeout(pump, finished ? 0 : 250)
      })
      stream.on('error', () => {
        if (!closed) response.end()
      })
    }
    pump()
  }


  /**
   * Play now, cache in the background.
   *
   * A finished `+faststart` file has a real moov duration and Range seeks, but
   * waiting for one on a 30 minute 1080P episode is a minute of black screen.
   * So: if the file is already there, serve it with Range; otherwise pipe a
   * fragmented mux immediately (starts in a second) and let the file build
   * behind it, which is where a later seek comes from.
   */
  async function dashStream(play, response, request, reload = null, startSeconds = 0) {
    console.info(
      `[dsh-anime] dash stream method=${request?.method ?? '-'} start=${startSeconds} dur=${play?.duration ?? '-'} ready=${existsSync(muxPathFor(play))}`,
    )
    // A HEAD must never spawn ffmpeg: the player probes the stream for its
    // duration, and a reader that hangs up would kill the mux it just started.
    if (request?.method === 'HEAD') {
      response.writeHead(200, {
        'content-type': 'video/mp4',
        ...(Number(play.duration) > 0 ? { 'x-duration': String(Math.round(Number(play.duration))) } : {}),
        'cache-control': 'no-store',
        'accept-ranges': 'bytes',
      })
      response.end()
      return
    }
    const file = muxPathFor(play)
    const ready = existsSync(file) && statSync(file).size > 0
    if (ready) {
      const size = statSync(file).size
      const range = parseRange(request?.headers?.range, size)
      const from = range?.start ?? 0
      const to = range?.end ?? size - 1
      const headers = {
        'content-type': 'video/mp4',
        ...(Number(play.duration) > 0 ? { 'x-duration': String(Math.round(Number(play.duration))) } : {}),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-length': String(to - from + 1),
      }
      if (range !== null) headers['content-range'] = `bytes ${from}-${to}/${size}`
      response.writeHead(range !== null ? 206 : 200, headers)
      const body = createReadStream(file, { start: from, end: to })
      body.on('error', () => {
        try {
          response.destroy()
        } catch {
          /* closed */
        }
      })
      response.on('close', () => {
        try {
          body.destroy()
        } catch {
          /* closed */
        }
      })
      body.pipe(response)
      return
    }

    // Nothing cached yet: let ffmpeg grow a fragmented file on disk and follow
    // it. Reading from a file cannot be killed by a browser hang-up, so the
    // encode survives the probe request that used to abort it.
    const live = startLive(play, startSeconds, reload)
    serveGrowing(live.target, live.done, response)
    if (startSeconds === 0) void dashFile(play, reload).catch(() => {})
    return

    // eslint-disable-next-line no-unreachable
    const ffmpeg = await findFfmpeg()
    if (ffmpeg === null) throw new Error('没有找到 ffmpeg，无法合并 DASH 音视频；请安装 ffmpeg 或改用种子源')
    const headers = `Referer: ${BILIBILI_REFERER}

User-Agent: ${BILIBILI_UA}

`
    const seekArgs = startSeconds > 0 ? ['-ss', String(Math.floor(startSeconds))] : []
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-fflags', '+nobuffer+genpts',
      '-flags', 'low_delay',
      '-probesize', '32768',
      '-analyzeduration', '0',
      ...seekArgs,
      '-headers', headers, '-i', play.videoUrl,
      ...(typeof play.audioUrl === 'string' ? ['-headers', headers, '-i', play.audioUrl] : []),
      '-map', '0:v:0',
      '-map', '1:a:0?',
      '-c', 'copy',
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
      '-flush_packets', '1',
      '-f', 'mp4',
      'pipe:1',
    ]
    response.writeHead(200, {
      'content-type': 'video/mp4',
      ...(Number(play.duration) > 0 ? { 'x-duration': String(Math.round(Number(play.duration))) } : {}),
      'cache-control': 'no-store',
      'accept-ranges': 'none',
    })
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      if (stderr.length > 4000) stderr = stderr.slice(-4000)
    })
    child.on('error', () => {
      try {
        response.destroy()
      } catch {
        /* closed */
      }
    })
    child.stdout.pipe(response)
    // A browser probes the URL with a short request and hangs up; killing the
    // encoder there would guarantee the real request starts from zero again.
    // Give it a grace window and only stop it when nobody comes back.
    let graceTimer = null
    response.on('close', () => {
      if (graceTimer !== null) return
      graceTimer = setTimeout(() => {
        graceTimer = null
        if (!child.killed) {
          try {
            child.kill()
          } catch {
            /* gone */
          }
        }
      }, 15000)
      if (typeof graceTimer.unref === 'function') graceTimer.unref()
    })
    child.on('exit', (code) => {
      if (code !== 0) console.warn(`[dsh-anime] live mux exited ${code}: ${stderr.trim().slice(-200)}`)
    })
    // Build the seekable file behind the live pipe (no `start`: full episode).
    if (startSeconds === 0) void dashFile(play, reload).catch(() => {})
  }

  async function stream(play, rangeHeader, response, startSeconds = 0, request = null, reload = null) {
    if (play?.kind === 'dash' && typeof play.videoUrl === 'string' && typeof play.audioUrl === 'string') {
      await dashStream(play, response, request, reload, startSeconds)
      return
    }
    const controller = new AbortController()
    // Only the handshake is bounded: a 50 MB episode takes minutes, and cutting
    // the body at a deadline would truncate every video.
    const timer = setTimeout(() => controller.abort(), 30000)
    let upstream
    try {
      upstream = await fetch(play.url, {
        signal: controller.signal,
        headers: {
          'user-agent': BILIBILI_UA,
          referer: BILIBILI_REFERER,
          origin: 'https://www.bilibili.com',
          ...(jar.value === '' ? {} : { cookie: jar.value }),
          accept: '*/*',
          ...(typeof rangeHeader === 'string' && rangeHeader !== '' ? { range: rangeHeader } : {}),
        },
      })
    } catch (error) {
      clearTimeout(timer)
      throw error
    }
    clearTimeout(timer)
    const headers = {
      'content-type': upstream.headers.get('content-type') ?? 'video/mp4',
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    }
    for (const name of ['content-length', 'content-range']) {
      const value = upstream.headers.get(name)
      if (value !== null) headers[name] = value
    }
    response.writeHead(upstream.status === 206 ? 206 : 200, headers)
    if (upstream.body === null) {
      response.end()
      return
    }
    const source = Readable.fromWeb(upstream.body)
    source.on('error', () => {
      try {
        response.destroy()
      } catch {
        /* already closed */
      }
    })
    response.on('close', () => {
      try {
        source.destroy()
      } catch {
        /* already gone */
      }
    })
    source.pipe(response)
  }

  /**
   * Progress-bar chapters for one episode, in two very different shapes.
   *
   * A PGC episode only ever has a *skip window*: `pgc/view/web/season` answers
   * `result.episodes[].skip.{op,ed}` in seconds, and an episode with no window
   * has zeros (`op.start = 0` is the normal film case), so the test is
   * `end > start`, never `start !== 0`.
   *
   * An upload has real chapters, but not where the old code looked: `view` has
   * no `view_points` field at all. They live on the player payload
   * (`x/player/v2?bvid=&cid=`, `view_points[].from/to/content`, also seconds),
   * which needs the part cid — taken from `view.pages[0]` when not given.
   */
  async function chapters({ epId = 0, seasonId = 0, bvid = '', cid = 0 }) {
    const { status, payload } = await (async () => {
      if (epId > 0 || seasonId > 0) {
        return await raw('/pgc/view/web/season', epId > 0 ? { ep_id: epId } : { season_id: seasonId })
      }
      if (cid > 0) return await raw('/x/player/v2', { bvid, cid })
      const view = await raw('/x/web-interface/view', { bvid })
      const partCid = toInt(view.payload?.data?.pages?.[0]?.cid, 0)
      if (partCid <= 0) return { status: view.status, payload: null }
      return await raw('/x/player/v2', { bvid, cid: partCid })
    })()
    const list = []
    if (epId > 0 || seasonId > 0) {
      const episodes = Array.isArray(payload?.result?.episodes) ? payload.result.episodes : []
      const episode = epId > 0 ? episodes.find((item) => toInt(item?.ep_id, 0) === epId) ?? null : episodes[0] ?? null
      const skip = episode?.skip ?? null
      for (const [title, window] of [
        ['片头', skip?.op],
        ['片尾', skip?.ed],
      ]) {
        const start = toInt(window?.start, 0)
        const end = toInt(window?.end, 0)
        if (end > start) list.push({ start, end, title, skip: true })
      }
      console.info(`[dsh-anime] pgc chapters ep=${epId} season=${seasonId} status=${status} -> ${list.length}`)
      return list.sort((left, right) => left.start - right.start)
    }
    const points = Array.isArray(payload?.data?.view_points) ? payload.data.view_points : []
    for (const point of points) {
      const start = toInt(point?.from, 0)
      const end = toInt(point?.to, 0)
      if (end > start) list.push({ start, end, title: String(point?.content ?? ''), skip: false })
    }
    console.info(`[dsh-anime] bili chapters bvid=${bvid} cid=${cid} status=${status} -> ${list.length}`)
    return list
  }

  // The routes live outside this factory, so anything they need has to come
  // back through the returned object: `dashDir`, `dashFiles` and the two cache
  // helpers are closure-local here.
  return {
    search,
    season,
    playurl,
    searchVideos,
    video,
    playVideo,
    stream,
    ensureCookie,
    chapters,
    muxCacheStats,
    clearMuxCache,
    dashCount: () => dashFiles.size,
    liveCount: () => liveFiles.size,
  }
}

/* ------------------------------------------------------------------ *
 * The account provider: scan a QR, or paste a cookie, and verify it.
 *
 * It lives here rather than in a shared accounts module because every fact
 * this needs — the passport host, the web UA, the `nav` shape — is bilibili's
 * own. The registry exposes it as `registry.account('bilibili')`.
 * ------------------------------------------------------------------ */

const BILIBILI_PASSPORT = 'https://passport.bilibili.com'

function biliText(value, limit = 8192) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

/** `nav` tells us who the cookie belongs to, or that it is stale. */
async function accountVerify(cookie) {
  const value = biliText(cookie)
  if (value === '') throw new Error('cookie 不能为空')
  const { status, payload } = await httpJson(`${BILIBILI_API}/x/web-interface/nav`, {
    headers: {
      'user-agent': BILIBILI_UA,
      referer: BILIBILI_REFERER,
      cookie: value,
      accept: 'application/json, text/plain, */*',
    },
  })
  if (status >= 400) throw new Error(`bilibili 响应 ${status}`)
  if (payload === null) throw new Error('bilibili 返回了非 JSON 响应')
  if (payload.code !== 0) throw new Error(`bilibili: ${payload.message ?? `code ${payload.code}`}`)
  const data = payload.data ?? {}
  if (data.isLogin !== true) throw new Error('这个 cookie 已经失效（未登录状态）')
  return {
    secret: value,
    fields: {
      uid: Number(data.mid) || null,
      name: biliText(data.uname, 120),
      avatar: biliText(data.face, 512) || '',
    },
    savedAt: Date.now(),
  }
}

async function accountStart() {
  const { status, payload } = await httpJson(`${BILIBILI_PASSPORT}/x/passport-login/web/qrcode/generate`, {
    headers: {
      'user-agent': BILIBILI_UA,
      referer: BILIBILI_REFERER,
      accept: 'application/json, text/plain, */*',
    },
  })
  if (status >= 400) throw new Error(`bilibili 响应 ${status}`)
  if (payload?.code !== 0) throw new Error(`bilibili: ${payload?.message ?? '无法生成二维码'}`)
  const url = String(payload?.data?.url ?? '')
  const key = String(payload?.data?.qrcode_key ?? '')
  if (url === '' || key === '') throw new Error('bilibili 没有返回二维码')
  const qr = await renderQr(url)
  return { url, key, image: qr.image, imageSource: qr.source }
}

/**
 * Poll one QR key. `code` follows bilibili: 86101 waiting, 86090 scanned,
 * 0 logged in, 86038 expired. On success the cookies arrive as Set-Cookie.
 */
async function accountPoll(key) {
  const qrcodeKey = biliText(key, 256)
  if (qrcodeKey === '') throw new Error('缺少 qrcode_key')
  const { status, payload, headers } = await httpJson(
    `${BILIBILI_PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    {
      headers: {
        'user-agent': BILIBILI_UA,
        referer: BILIBILI_REFERER,
        accept: 'application/json, text/plain, */*',
      },
    },
  )
  if (status >= 400) throw new Error(`bilibili 响应 ${status}`)
  const code = payload?.data?.code ?? payload?.code ?? -1
  const message = payload?.data?.message ?? payload?.message ?? ''
  if (code !== 0) {
    return { state: code === 86038 ? 'expired' : code === 86090 ? 'scanned' : 'waiting', message, cookie: '' }
  }
  const list = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : []
  const pairs = []
  for (const line of list) {
    const head = String(line).split(';')[0]?.trim() ?? ''
    if (head.includes('=')) pairs.push(head)
  }
  const cookie = pairs.join('; ')
  if (cookie === '') throw new Error('登录成功但没有拿到 cookie')
  return { state: 'ok', message: message === '' ? '登录成功' : message, cookie }
}

/** What the extension registry needs to stand up an account provider. */
export const bilibiliAccount = {
  provider: 'bilibili',
  label: '哔哩哔哩',
  hint: '扫码登录后，在线流会带上你的账号：1080P / 大会员片源都能播。',
  kind: 'qr',
  placeholder: '也可以直接粘贴 cookie',
  start: accountStart,
  poll: accountPoll,
  verify: accountVerify,
}
