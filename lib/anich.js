// AniCh（https://github.com/Sle2p/AniCh）的后端客户端。
//
// 站点接口是 protobuf：/login 收 form 字段 data=<字节逗号串>，其余接口要么回
// application/octet-stream 原始 protobuf，要么回 JSON 数字数组（也就是同一份字
// 节）；认证靠 `_` 请求头，内容是一个 token_ 消息 {1: token, 2: 十六进制毫秒}。
//
// 这里只用数据接口，不碰弹幕与评论。字段号从上游 lib/protobuf/*.pb.dart 抄来。

const UA = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'
export const ANICH_HOSTS = ['https://ani.emmmm.eu.org', 'https://api.500403.xyz']

// 上游 protobuf 生成文件里读出来的字段表（只列用到的）。
const SCHEMA = {
  bangumi_list_item_: {
    1: { name: 'id', kind: 'number' },
    2: { name: 'title', kind: 'string' },
    3: { name: 'episode', kind: 'number' },
    4: { name: 'episodesTotal', kind: 'number' },
    5: { name: 'status', kind: 'string' },
    6: { name: 'date', kind: 'number' },
    7: { name: 'image', kind: 'string' },
    8: { name: 'tagline', kind: 'string' },
  },
  bangumi_latest_item_: {
    1: { name: 'status', kind: 'bool' },
    2: { name: 'id', kind: 'number' },
    3: { name: 'ep', kind: 'number' },
    4: { name: 'airdate', kind: 'number' },
    5: { name: 'duration', kind: 'number' },
    6: { name: 'image', kind: 'string' },
    7: { name: 'title', kind: 'string' },
    8: { name: 'name', kind: 'string' },
  },
  bangumi_episodes_data_: {
    1: { name: 'status', kind: 'bool' },
    2: { name: 'sort', kind: 'number' },
    3: { name: 'airdate', kind: 'number' },
    4: { name: 'duration', kind: 'number' },
    7: { name: 'image', kind: 'string' },
    8: { name: 'title', kind: 'string' },
    9: { name: 'overview', kind: 'string' },
  },
  vod_item_: {
    1: { name: 'url', kind: 'string' },
    2: { name: 'sort', kind: 'number' },
    3: { name: 'type', kind: 'string' },
    4: { name: 'caption', kind: 'string' },
  },
  login_: {
    1: { name: 'error', kind: 'bool' },
    2: { name: 'message', kind: 'string' },
  },
}

function varint(value) {
  const out = []
  let rest = Number(value) >>> 0
  while (rest > 127) {
    out.push((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  out.push(rest)
  return out
}

function encodeString(tag, text) {
  const bytes = [...Buffer.from(String(text), 'utf8')]
  return [...varint((tag << 3) | 2), ...varint(bytes.length), ...bytes]
}

function readVarint(buffer, state) {
  let shift = 0
  let value = 0
  while (state.index < buffer.length) {
    const byte = buffer[state.index++]
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return value
}

function decodeFields(buffer) {
  const out = []
  const state = { index: 0 }
  while (state.index < buffer.length) {
    const key = readVarint(buffer, state)
    const tag = Math.floor(key / 8)
    const wire = key & 7
    if (wire === 0) {
      out.push({ tag, wire, value: readVarint(buffer, state) })
      continue
    }
    if (wire === 2) {
      const length = readVarint(buffer, state)
      out.push({ tag, wire, bytes: buffer.subarray(state.index, state.index + length) })
      state.index += length
      continue
    }
    if (wire === 5) {
      state.index += 4
      continue
    }
    if (wire === 1) {
      state.index += 8
      continue
    }
    break
  }
  return out
}

function decodeTyped(buffer, type) {
  const spec = SCHEMA[type] ?? {}
  const out = {}
  for (const field of decodeFields(buffer)) {
    const info = spec[field.tag]
    const name = info?.name ?? `field${field.tag}`
    if (field.wire === 0) {
      out[name] = info?.kind === 'bool' ? field.value === 1 : field.value
      continue
    }
    const text = field.bytes.toString('utf8')
    if (info?.kind === 'number') out[name] = Number(text) || 0
    else out[name] = text
  }
  return out
}

function decodeRepeated(buffer, type) {
  const items = []
  for (const field of decodeFields(buffer)) {
    if (field.wire !== 2) continue
    items.push(decodeTyped(field.bytes, type))
  }
  return items
}

// /bangumi/detail/{id} 回的是普通 JSON（不是 protobuf），直接透传关键字段。
export async function detail({ base, token, id }) {
  const animeId = Number(String(id).replace(/[^0-9]/g, ''))
  if (!Number.isFinite(animeId) || animeId <= 0) throw new Error('AniCh：番剧 id 不对')
  const result = await request(base, `/bangumi/detail/${animeId}`, { token })
  const text = result.buffer.toString('utf8').trim()
  if (!text.startsWith('{')) throw new Error(`AniCh：详情返回异常（HTTP ${result.status}）`)
  const parsed = JSON.parse(text)
  // 未登录时站点回的是 `{"error":true,"message":"unauthorized","body":{}}`，
  // HTTP 仍是 200，所以照字段读会得到一个全空的番剧——详情页会静悄悄变成白页。
  // 宁可抛出来让界面说「登录过期」，也不要假装这是一部没简介的番。
  if (parsed?.error === true) throw new Error(`AniCh：${parsed.message ?? '请求失败'}`)
  return {
    id: String(parsed.id ?? animeId),
    title: String(parsed.title ?? ''),
    titles: Array.isArray(parsed.titles) ? parsed.titles : [],
    cover: String(parsed.image ?? ''),
    lang: String(parsed.lang ?? ''),
    region: Array.isArray(parsed.region) ? parsed.region : [],
    genres: Array.isArray(parsed.genres) ? parsed.genres : [],
    overview: String(parsed.overview ?? ''),
    score: Number(parsed?.rating?.[0]?.score ?? 0) || 0,
    year: parsed.airdate ? new Date(Number(parsed.airdate)).getFullYear() : 0,
  }
}

// 上游 urlDecode：去掉第 4 个字符再 base64 解。
export function decodePlayUrl(raw) {
  const text = String(raw ?? '')
  if (text === '') return ''
  try {
    return Buffer.from(text.slice(0, 3) + text.slice(4), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

export function authHeader(token) {
  const time = (Date.now() + 60_000).toString(16)
  return [...encodeString(1, token), ...encodeString(2, time)].join(',')
}

function hostOf(base) {
  const text = String(base ?? '').trim().replace(/\/$/, '')
  if (/^https?:\/\//.test(text)) return text
  return ANICH_HOSTS[0]
}

// 站点在 Cloudflare 后面，从国内网络连它的 443 会间歇性握手失败或超时（同一
// 台机器、同一份 token，前一秒 10s 连不上，后一秒 3.6s 就回来了）。一次失败就
// 当「来源坏了」会让整个源看起来不可用，所以单个请求自己重试，退避 3 次。
const RETRY_DELAYS = [600, 1500, 3000]

function retryable(error) {
  if (error === null || error === undefined) return false
  const name = String(error.name ?? '')
  if (name === 'AbortError' || name === 'TimeoutError') return true
  const code = String(error?.cause?.code ?? error?.code ?? '')
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return true
  }
  const message = String(error?.message ?? '')
  return message === 'fetch failed' || message.includes('operation was aborted')
}

async function requestOnce(base, path, { token, method, form, timeoutMs }) {
  const headers = { 'user-agent': UA, accept: '*/*' }
  if (token !== '') headers._ = authHeader(token)
  let body
  if (form !== null) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(form).toString()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(hostOf(base) + path, { method, headers, body, signal: controller.signal })
    const buffer = Buffer.from(await response.arrayBuffer())
    return { status: response.status, type: response.headers.get('content-type') ?? '', buffer }
  } finally {
    clearTimeout(timer)
  }
}

async function request(base, path, { token = '', method = 'GET', form = null, timeoutMs = 20000 } = {}) {
  let last = null
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      return await requestOnce(base, path, { token, method, form, timeoutMs })
    } catch (error) {
      last = error
      if (attempt === RETRY_DELAYS.length || retryable(error) === false) break
      await new Promise((done) => setTimeout(done, RETRY_DELAYS[attempt]))
    }
  }
  throw last
}

// 有的接口回原始 protobuf，有的回 JSON 数字数组，统一成 Buffer。
function payloadBuffer(result) {
  if (result.type.includes('json')) {
    const text = result.buffer.toString('utf8').trim()
    if (text.startsWith('[')) {
      try {
        return Buffer.from(JSON.parse(text))
      } catch {
        return Buffer.alloc(0)
      }
    }
    const parsed = JSON.parse(text)
    if (parsed?.error) throw new Error(`AniCh：${parsed.message ?? '请求失败'}`)
    return Buffer.alloc(0)
  }
  return result.buffer
}

export async function login({ base, user, password }) {
  const payload = [...encodeString(1, user), ...encodeString(2, password)].join(',')
  const result = await request(base, '/login', { method: 'POST', form: { data: payload } })
  const fields = decodeFields(result.buffer)
  let message = ''
  let token = ''
  let failed = false
  for (const field of fields) {
    if (field.wire === 0 && field.tag === 1) failed = field.value === 1
    if (field.wire === 2 && field.tag === 2) message = field.bytes.toString('utf8')
    if (field.wire === 2 && field.tag === 3) {
      for (const inner of decodeFields(field.bytes)) {
        if (inner.wire !== 2) continue
        if (inner.tag === 2) token = inner.bytes.toString('utf8')
      }
    }
  }
  if (token === '') throw new Error(`AniCh 登录失败：${message === '' ? `HTTP ${result.status}` : message}`)
  return { token, message }
}

// /init 回 init_ {1:error, 2:message, 3:body{1:user}}，user 里 1=头像 2=邮箱 3=昵称 11=id。
export async function profile({ base, token }) {
  if (String(token ?? '') === '') throw new Error('AniCh：还没登录')
  const result = await request(base, '/init', { token: String(token) })
  const fields = decodeFields(payloadBuffer(result))
  let failed = false
  let message = ''
  const user = {}
  for (const field of fields) {
    if (field.wire === 0 && field.tag === 1) failed = field.value === 1
    if (field.wire === 2 && field.tag === 2) message = field.bytes.toString('utf8')
    if (field.wire === 2 && field.tag === 3) {
      for (const inner of decodeFields(field.bytes)) {
        if (inner.wire !== 2 || inner.tag !== 1) continue
        for (const item of decodeFields(inner.bytes)) {
          if (item.wire === 2 && item.tag === 1) user.avatar = item.bytes.toString('utf8')
          if (item.wire === 2 && item.tag === 2) user.email = item.bytes.toString('utf8')
          if (item.wire === 2 && item.tag === 3) user.name = item.bytes.toString('utf8')
          if (item.wire === 2 && item.tag === 4) user.role = item.bytes.toString('utf8')
          if (item.wire === 0 && item.tag === 11) user.uid = String(item.value)
        }
      }
    }
  }
  if (failed || Object.keys(user).length === 0) {
    throw new Error(`AniCh 取不到账号信息：${message === '' ? `HTTP ${result.status}` : message}`)
  }
  return user
}

// 发邮箱验证码；接口回普通 JSON（成功 {error:false,...}）。
export async function sendCode({ base, email }) {
  const address = String(email ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+$/.test(address)) throw new Error('AniCh：邮箱格式不对')
  const result = await request(base, '/code', { method: 'POST', form: { email: address } })
  const text = result.buffer.toString('utf8').trim()
  let message = ''
  let failed = false
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      failed = parsed?.error === true
      message = String(parsed?.message ?? '')
    } catch {
      message = text.slice(0, 200)
    }
  }
  if (failed) throw new Error(`AniCh 发送验证码失败：${message === '' ? `HTTP ${result.status}` : message}`)
  return { message: message === '' ? '验证码已发送' : message }
}

// 注册：data=register_request_{1:email,2:code,3:name,4:password}；回 register_，形状同 login_。
export async function register({ base, email, code, name, password }) {
  const address = String(email ?? '').trim()
  const uname = String(name ?? '').trim()
  if (address === '') throw new Error('AniCh：请填邮箱')
  if (String(code ?? '').trim() === '') throw new Error('AniCh：请填邮箱验证码')
  if (uname === '') throw new Error('AniCh：请填用户名')
  if (String(password ?? '') === '') throw new Error('AniCh：请填密码')
  const payload = [
    ...encodeString(1, address),
    ...encodeString(2, String(code).trim()),
    ...encodeString(3, uname),
    ...encodeString(4, String(password)),
  ].join(',')
  const result = await request(base, '/register', { method: 'POST', form: { data: payload } })
  /*
   * 失败时站点回的是普通 JSON，和 `/code` 一样：`{"error":true,"message":"验证码不正确","body":{}}`。
   * 只有成功才回 protobuf。以前一律按 protobuf 解，这段 JSON 会被读成一堆乱字段，于是
   * 用户看到的是「注册失败：HTTP 200」——最该给出的那句「验证码不正确」就这么丢了。
   */
  const head = result.buffer.subarray(0, 1).toString('utf8')
  if (head === '{') {
    const text = result.buffer.toString('utf8')
    let message = ''
    try {
      message = String(JSON.parse(text)?.message ?? '')
    } catch {
      message = text.slice(0, 200)
    }
    throw new Error(`AniCh 注册失败：${message === '' ? `HTTP ${result.status}` : message}`)
  }
  const fields = decodeFields(result.buffer)
  let message = ''
  let token = ''
  let failed = false
  for (const field of fields) {
    if (field.wire === 0 && field.tag === 1) failed = field.value === 1
    if (field.wire === 2 && field.tag === 2) message = field.bytes.toString('utf8')
    if (field.wire === 2 && field.tag === 3) {
      for (const inner of decodeFields(field.bytes)) {
        if (inner.wire !== 2) continue
        if (inner.tag === 2) token = inner.bytes.toString('utf8')
      }
    }
  }
  if (token === '') throw new Error(`AniCh 注册失败：${message === '' ? `HTTP ${result.status}` : message}`)
  return { token, message, name: uname, email: address }
}

function mapItem(item) {
  return {
    id: String(item.id ?? ''),
    title: String(item.title ?? ''),
    cover: String(item.image ?? ''),
    note: String(item.tagline ?? ''),
    total: Number(item.episodesTotal ?? 0) || 0,
  }
}

export async function search({ base, token, term, page = 1 }) {
  const skip = Math.max(0, (Number(page) || 1) - 1) * 50
  const query = `/bangumi/search?keyword=${encodeURIComponent(term)}&skip=${skip}`
  const result = await request(base, query, { token })
  const items = decodeRepeated(payloadBuffer(result), 'bangumi_list_item_')
  return items.map(mapItem).filter((item) => item.id !== '' && item.title !== '')
}

export async function browse({ base, token, page = 1 }) {
  const skip = Math.max(0, (Number(page) || 1) - 1) * 50
  const result = await request(base, `/bangumi/list?skip=${skip}`, { token })
  const items = decodeRepeated(payloadBuffer(result), 'bangumi_list_item_')
  return items.map(mapItem).filter((item) => item.id !== '')
}

export async function latest({ base, token }) {
  const result = await request(base, '/bangumi/latest', { token })
  const items = decodeRepeated(payloadBuffer(result), 'bangumi_latest_item_')
  return items
    .filter((item) => item.id)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title ?? ''),
      cover: String(item.image ?? ''),
      note: String(item.name ?? ''),
      air: Number(item.airdate ?? 0) || 0,
    }))
}

export async function episodes({ base, token, id }) {
  const animeId = Number(String(id).replace(/[^0-9]/g, ''))
  if (!Number.isFinite(animeId) || animeId <= 0) throw new Error('AniCh：番剧 id 不对')
  const result = await request(base, `/bangumi/episodes/${animeId}`, { token })
  const items = decodeRepeated(payloadBuffer(result), 'bangumi_episodes_data_')
  return items
    .map((item) => ({
      number: Number(item.sort ?? 0) || 0,
      title: String(item.title ?? ''),
      image: String(item.image ?? ''),
    }))
    .filter((item) => item.number > 0)
    .map((item) => ({
      id: String(item.number),
      number: item.number,
      title: item.title === '' ? `第${item.number}集` : item.title,
    }))
}

// /vod 回的是线路列表：同一个 url 字段里是「去掉第 4 个字符再 base64」的地址。
//
// 一集实测有 15 条线路，caption 形如 `全集(全高清-1080P) · 1080P`，但 caption 会
// 重复（同一集里有 4 条都叫 `HD · 1080P`），所以它只能在界面上当说明，线路身份
// 必须用序号。type 也不能只看后缀：有些线路的地址是 `.../api/v2/files/xxx` 这样
// 没有扩展名的，实际回的是 `#EXTM3U`，按后缀会被当成 mp4 而播不出来 —— 那种情况
// 交给宿主嗅探首字节（见 index.js 的 online/stream），这里只在确定时才给 m3u8。
export async function sources({ base, token, id, episode }) {
  const animeId = Number(String(id).replace(/[^0-9]/g, ''))
  const index = Number(episode)
  if (!Number.isFinite(animeId) || animeId <= 0 || !Number.isFinite(index) || index <= 0) {
    throw new Error('AniCh：需要番剧 id 与集数')
  }
  const result = await request(base, `/vod/${animeId}/${index}`, { token })
  const items = decodeRepeated(payloadBuffer(result), 'vod_item_')
  const lines = []
  for (const item of items) {
    const url = decodePlayUrl(item.url)
    if (url === '') continue
    // 站点在播放器里混了广告：同一集里那几条 caption 重复的 `全集(全高清-1080P)`
    // 其实是小红书 CDN 上的宣传片 m3u8，点开只会「转码没出画面」。它们在源头就
    // 没有播放价值，留着还会把用户引到错的线路上。
    if (isAdvert(url)) continue
    const bare = url.split('?')[0].split('#')[0].toLowerCase()
    if (bare.endsWith('.png') || bare.endsWith('.jpg') || bare.endsWith('.jpeg')) continue
    const type = bare.includes('.m3u8')
      ? 'm3u8'
      : bare.endsWith('.mp4')
        ? 'mp4'
        : 'auto'
    lines.push({
      url,
      type,
      caption: String(item.caption ?? ''),
      sort: Number(item.sort ?? 0) || 0,
      index: lines.length,
    })
  }
  return lines
}

// 广告线路的宿主：这几个站点的视频不是番剧本身，是播放器里夹带的宣传片。
const ADVERT_HOSTS = [
  'xiaohongshu.com',
  'xhscdn.com',
  'weibo.com',
  'weibocdn.com',
  'douyin.com',
  'iesdouyin.com',
  'kuaishou.com',
  'weixin.qq.com',
]

function isAdvert(url) {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host === '') return false
  return ADVERT_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`))
}

// 线路在界面上的名字：序号 + 真实 caption，两者都要（只给序号则看不出画质，只给
// caption 则有重名）。resolve() 靠开头的「线路N」反查回序号。
export function lineName(index, caption) {
  const label = String(caption ?? '').trim()
  const slot = `线路${Number(index) + 1}`
  return label === '' ? slot : `${slot} · ${label}`
}
