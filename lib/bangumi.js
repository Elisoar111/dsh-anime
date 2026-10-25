/**
 * Bangumi (bgm.tv) provider: the account flow and the v0 data calls.
 *
 * Two ways in, both supported at once:
 *
 *   - OAuth 2.0 authorization code. Bangumi ships an OAuth app per client, so
 *     the user registers one at https://bgm.tv/dev/app, pastes the App ID and
 *     App Secret into the extension settings, and the host builds the
 *     authorize URL with a loopback redirect (`…/bangumi/oauth/callback`).
 *     The code is exchanged host-side for an access + refresh token pair,
 *     because that exchange needs the secret and must not happen in the page.
 *     This is the same shape AnimeFlow uses (`/oauth/authorize` → code →
 *     their backend swaps it), only here the "backend" is the plugin host.
 *   - A personal Access Token from https://next.bgm.tv/demo/access-token,
 *     pasted directly. Still the fastest path when no OAuth app exists.
 *
 * Everything below the account layer is the public v0 API: subject, episodes,
 * collections and episode marks. bgm.tv is unreachable from some networks, so
 * failures say so instead of surfacing a bare `fetch failed`.
 */
import { httpJson } from './accounts.js'

const ENDPOINT = 'https://api.bgm.tv'
/**
 * Official bgm.tv times out at TCP level from this network (measured twice in
 * .87: every request aborted), while the anibt mirror answers /calendar,
 * /v0/subjects, /v0/episodes and /v0/search/subjects with 200. So "no API base
 * configured" means the mirror; typing the official URL is how you pick official.
 */
const MIRROR = 'https://bgmapi.anibt.net'
const OAUTH_AUTHORIZE = 'https://bgm.tv/oauth/authorize'
const OAUTH_TOKEN = 'https://bgm.tv/oauth/access_token'
const UA = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'

/**
 * Where the v0 API lives. bgm.tv is unreachable from some networks (notably
 * mainland China without a proxy), so the Host can point this at a mirror and
 * the account flow keeps the same shape.
 */
let apiBase = MIRROR

export function setApiBase(base) {
  const value = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : ''
  apiBase = value === '' ? MIRROR : value
}

export function officialEndpoint() {
  return ENDPOINT
}

export function apiBaseUrl() {
  return apiBase
}

/** 1 想看 / 2 看过 / 3 在看 / 4 搁置 / 5 抛弃 — Bangumi's own order. */
export const COLLECTION_TYPES = [
  { value: 1, label: '想看', labelEn: 'Wish' },
  { value: 2, label: '看过', labelEn: 'Done' },
  { value: 3, label: '在看', labelEn: 'Doing' },
  { value: 4, label: '搁置', labelEn: 'On hold' },
  { value: 5, label: '抛弃', labelEn: 'Dropped' },
]

function text(value, limit = 4096) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

function headers(token = '') {
  const result = {
    'user-agent': UA,
    accept: 'application/json',
  }
  if (token !== '') result.authorization = `Bearer ${token}`
  return result
}

function networkError(error) {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`连不上 Bangumi（${detail}），本机网络可能访问不了 bgm.tv`)
}

async function requestJson(url, token = '') {
  let response = null
  try {
    response = await httpJson(url, { headers: headers(token) })
  } catch (error) {
    throw networkError(error)
  }
  const { status, payload } = response
  if (status === 401) throw new Error('Bangumi 拒绝了这个 token（可能已过期）')
  if (status === 404) throw new Error('Bangumi 上找不到这一条')
  if (status >= 400) throw new Error(`Bangumi 响应 ${status}`)
  if (payload === null || typeof payload !== 'object') throw new Error('Bangumi 返回了非 JSON 响应')
  return payload
}

/* ------------------------------------------------------------------ account */

async function verify(token) {
  const value = text(token)
  if (value === '') throw new Error('token 不能为空')
  const payload = await requestJson(`${apiBase}/v0/me`, value)
  return {
    secret: value,
    fields: {
      uid: Number(payload.id) || null,
      name: text(payload.username ?? payload.nickname, 120),
      avatar: text(payload.avatar?.large ?? payload.avatar?.medium, 512),
      kind: 'token',
    },
    savedAt: Date.now(),
  }
}

/** The URL the browser goes to; `state` is echoed back to the callback. */
export function authorizeUrl({ clientId, redirectUri, state }) {
  const id = text(clientId, 200)
  if (id === '') throw new Error('还没有填 Bangumi 应用 App ID（设置 → 片源 → Bangumi 偏好）')
  const url = new URL(OAUTH_AUTHORIZE)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', id)
  url.searchParams.set('redirect_uri', redirectUri)
  if (typeof state === 'string' && state !== '') url.searchParams.set('state', state)
  return url.toString()
}

async function postForm(url, form) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(form)) body.set(key, String(value))
  let response = null
  try {
    response = await httpJson(url, {
      method: 'POST',
      headers: {
        ...headers(),
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: body.toString(),
    })
  } catch (error) {
    throw networkError(error)
  }
  const { status, payload } = response
  if (status === 400 || status === 401) {
    const message =
      (typeof payload?.error_description === 'string' && payload.error_description) ||
      (typeof payload?.error === 'string' && payload.error) ||
      `Bangumi 响应 ${status}`
    throw new Error(`Bangumi 拒绝了这次授权：${message}`)
  }
  if (status >= 400) throw new Error(`Bangumi 响应 ${status}`)
  if (payload === null || typeof payload !== 'object') throw new Error('Bangumi 返回了非 JSON 响应')
  if (typeof payload.access_token !== 'string' || payload.access_token === '') {
    throw new Error('Bangumi 没有返回 access_token')
  }
  return payload
}

/** Swaps the code from the redirect for access + refresh tokens. */
export async function exchangeCode({ clientId, clientSecret, code, redirectUri }) {
  const id = text(clientId, 200)
  const secret = text(clientSecret, 400)
  const value = text(code, 400)
  if (id === '' || secret === '') throw new Error('还没有填 Bangumi 应用 App ID / App Secret')
  if (value === '') throw new Error('没有拿到授权码')
  const payload = await postForm(OAUTH_TOKEN, {
    grant_type: 'authorization_code',
    client_id: id,
    client_secret: secret,
    code: value,
    redirect_uri: redirectUri,
  })
  const me = await requestJson(`${apiBase}/v0/me`, payload.access_token)
  const expiresIn = Number(payload.expires_in) || 0
  return {
    secret: payload.access_token,
    fields: {
      uid: Number(me.id ?? payload.user_id) || null,
      name: text(me.username ?? me.nickname, 120),
      avatar: text(me.avatar?.large ?? me.avatar?.medium, 512),
      kind: 'oauth',
      refresh: text(payload.refresh_token, 400),
      expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
    },
    savedAt: Date.now(),
  }
}

/** Rotates the token pair; Bangumi also rotates the refresh token. */
export async function refreshTokens({ clientId, clientSecret, refreshToken }) {
  const id = text(clientId, 200)
  const secret = text(clientSecret, 400)
  const value = text(refreshToken, 400)
  if (id === '' || secret === '' || value === '') throw new Error('缺少刷新 token 需要的参数')
  const payload = await postForm(OAUTH_TOKEN, {
    grant_type: 'refresh_token',
    client_id: id,
    client_secret: secret,
    refresh_token: value,
  })
  const expiresIn = Number(payload.expires_in) || 0
  return {
    access: payload.access_token,
    refresh: text(payload.refresh_token, 400),
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
  }
}

export const bangumiAccount = {
  provider: 'bangumi',
  label: 'Bangumi',
  hint:
    '两条路都行：在 https://bgm.tv/dev/app 建一个应用，把 App ID / App Secret 填到本扩展的偏好里，然后点「授权」；' +
    '或者直接粘贴 https://next.bgm.tv/demo/access-token 生成的个人 Access Token。',
  kind: 'oauth',
  link: 'https://bgm.tv/dev/app',
  placeholder: '也可以直接粘贴 Access Token',
  verify,
}

/* --------------------------------------------------------------------- data */

/** Subject detail: rating, rank, tags, summary, images. */
export async function subject(id) {
  const key = Number(id) || 0
  if (key <= 0) throw new Error('id 必须是 Bangumi 条目 id')
  const payload = await requestJson(`${apiBase}/v0/subjects/${key}`)
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .slice(0, 12)
        .map((tag) => ({ name: text(tag?.name, 40), count: Number(tag?.count) || 0 }))
        .filter((tag) => tag.name !== '')
    : []
  return {
    id: Number(payload.id) || key,
    name: text(payload.name, 200),
    nameCn: text(payload.name_cn ?? payload.nameCN, 200),
    summary: text(payload.summary, 4000),
    date: text(payload.date, 20),
    platform: text(payload.platform, 40),
    eps: Number(payload.eps ?? payload.total_episodes) || 0,
    score: Number(payload.rating?.score) || 0,
    rank: Number(payload.rating?.rank) || 0,
    votes: Number(payload.rating?.total) || 0,
    cover: text(payload.images?.large ?? payload.images?.common ?? payload.images?.medium, 512),
    tags,
  }
}

/** Every episode of a subject, oldest first. */
export async function episodes(id) {
  const key = Number(id) || 0
  if (key <= 0) throw new Error('id 必须是 Bangumi 条目 id')
  const payload = await requestJson(
    `${apiBase}/v0/episodes?subject_id=${key}&type=0&limit=100&offset=0`,
  )
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  return list.map((episode, index) => ({
    id: Number(episode?.id) || 0,
    sort: Number(episode?.sort) || index + 1,
    type: Number(episode?.type) || 0,
    name: text(episode?.name, 200),
    nameCn: text(episode?.name_cn, 200),
    airdate: text(episode?.airdate, 20),
    duration: text(episode?.duration, 20),
    comment: Number(episode?.comment) || 0,
  }))
}

/**
 * The logged-in user's collection of one subject, plus which episodes are
 * already marked watched (`ep_status` is a count, so the episode list is
 * filtered by the per-episode marks below when the page needs them).
 */
export async function collectionFor(token, subjectId) {
  const key = Number(subjectId) || 0
  if (key <= 0) throw new Error('id 必须是 Bangumi 条目 id')
  const payload = await requestJson(`${apiBase}/v0/users/-/collections/${key}`, token)
  return {
    type: Number(payload?.type) || 0,
    epStatus: Number(payload?.ep_status) || 0,
    volStatus: Number(payload?.vol_status) || 0,
    updatedAt: Number(payload?.updated_at) || 0,
    private: payload?.private === true,
    comment: text(payload?.comment, 2000),
    tags: Array.isArray(payload?.tags) ? payload.tags.map((tag) => text(tag, 40)) : [],
  }
}

/** Sets the collection bucket (1–5) for a subject. */
export async function setCollection(token, subjectId, type) {
  const key = Number(subjectId) || 0
  const bucket = Number(type) || 0
  if (key <= 0) throw new Error('id 必须是 Bangumi 条目 id')
  if (!COLLECTION_TYPES.some((entry) => entry.value === bucket)) throw new Error('收藏类型只能是 1–5')
  let response = null
  try {
    response = await httpJson(`${apiBase}/v0/users/-/collections/${key}`, {
      method: 'POST',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify({ type: bucket }),
    })
  } catch (error) {
    throw networkError(error)
  }
  if (response.status === 401) throw new Error('Bangumi 拒绝了这个 token（可能已过期）')
  if (response.status >= 400) {
    const message = typeof response.payload?.description === 'string' ? response.payload.description : ''
    throw new Error(message === '' ? `Bangumi 响应 ${response.status}` : message)
  }
  return { ok: true, type: bucket }
}

/**
 * Marks episodes watched (or not) in one call.
 *
 * `type` follows Bangumi's episode status: 0 未看 / 1 想看 / 2 看过. The API
 * takes the whole set of episode ids, so a range mark is one request.
 */
export async function markEpisodes(token, subjectId, episodeIds, type = 2) {
  const key = Number(subjectId) || 0
  const ids = (Array.isArray(episodeIds) ? episodeIds : [episodeIds])
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0)
  const status = Number(type) || 0
  if (key <= 0) throw new Error('id 必须是 Bangumi 条目 id')
  if (ids.length === 0) throw new Error('没有要标记的剧集')
  if (![0, 1, 2].includes(status)) throw new Error('剧集状态只能是 0 / 1 / 2')
  let response = null
  try {
    response = await httpJson(`${apiBase}/v0/users/-/collections/${key}/episodes`, {
      method: 'POST',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify({ episode_id: ids, type: status }),
    })
  } catch (error) {
    throw networkError(error)
  }
  if (response.status === 401) throw new Error('Bangumi 拒绝了这个 token（可能已过期）')
  if (response.status >= 400) {
    const message = typeof response.payload?.description === 'string' ? response.payload.description : ''
    throw new Error(message === '' ? `Bangumi 响应 ${response.status}` : message)
  }
  return { ok: true, episodes: ids, type: status }
}

/** What the user is watching / wishes / dropped, newest first. */
export async function collections(token, { type = 3, limit = 24, offset = 0 } = {}) {
  const bucket = Number(type) || 3
  const size = Math.min(Math.max(Number(limit) || 24, 1), 50)
  const skip = Math.max(Number(offset) || 0, 0)
  const payload = await requestJson(
    `${apiBase}/v0/users/-/collections?subject_type=2&type=${bucket}&limit=${size}&offset=${skip}`,
    token,
  )
  const list = Array.isArray(payload?.data) ? payload.data : []
  return {
    total: Number(payload?.total) || list.length,
    items: list.map((entry) => ({
      subjectId: Number(entry?.subject_id) || 0,
      name: text(entry?.subject?.name_cn ?? entry?.subject?.name, 200),
      nameOriginal: text(entry?.subject?.name, 200),
      cover: text(entry?.subject?.images?.common ?? entry?.subject?.images?.medium, 512),
      date: text(entry?.subject?.date, 20),
      score: Number(entry?.subject?.score) || 0,
      type: Number(entry?.type) || bucket,
      epStatus: Number(entry?.ep_status) || 0,
      eps: Number(entry?.subject?.eps) || 0,
      updatedAt: Number(entry?.updated_at) || 0,
    })),
  }
}
