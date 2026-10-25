/**
 * Torrent playback plumbing.
 *
 * Two clients with one interface, mirroring how Seanime separates its built-in
 * engine from external clients:
 *
 *  - `builtin` streams straight out of the embedded WebTorrent engine. Nothing
 *    has to be installed and playback can start before the file is complete.
 *  - `qbittorrent` hands the magnet to a running qBittorrent Web API and streams
 *    the same file from disk as it downloads.
 *
 * Above that sits a transcoder: Chromium in the DSH window plays H.264/AAC in an
 * MP4 or Matroska container, and nothing else. Releases that are x265, AV1 or
 * 10-bit get remuxed or transcoded through ffmpeg, and users who already have
 * mpv can hand the stream URL to it instead.
 */

import { execFile, spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const VIDEO_EXTENSIONS = /\.(mkv|mp4|m4v|webm|avi|ts|mov|flv|wmv)$/i
const BROWSER_MP4 = /\.(mp4|m4v|webm)$/i
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  'ffmpeg',
  'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
].filter((value) => typeof value === 'string' && value !== '')
const FFPROBE_CANDIDATES = [
  process.env.FFPROBE_PATH,
  'ffprobe',
  'C:\\Program Files (x86)\\ffmpeg\\bin\\ffprobe.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
].filter((value) => typeof value === 'string' && value !== '')
export const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
/** Anime4K shader packs shipped with the plugin (copied from anich's flutter assets). */
export const SHADER_DIR = join(PLUGIN_ROOT, 'assets', 'anime4k')
// Mirrors Seanime's Anime4K option list (13 modes + off) so the two players
// offer the same ladder; each entry is the mpv --glsl-shaders-append chain.
export const ANIME4K_PRESETS = {
  off: [],
  'mode-a': ['Clamp_Highlights', 'Restore_CNN_M', 'Upscale_CNN_x2_M'],
  'mode-b': ['Clamp_Highlights', 'Restore_CNN_Soft_S', 'Upscale_CNN_x2_S'],
  'mode-c': ['Clamp_Highlights', 'Upscale_Denoise_CNN_x2_S', 'Restore_CNN_S', 'Upscale_CNN_x2_S'],
  'mode-aa': [
    'Clamp_Highlights',
    'Restore_CNN_M',
    'Upscale_CNN_x2_M',
    'AutoDownscalePre_x2',
    'Restore_CNN_M',
    'Upscale_CNN_x2_M',
  ],
  'mode-bb': [
    'Clamp_Highlights',
    'Restore_CNN_Soft_M',
    'Upscale_CNN_x2_M',
    'AutoDownscalePre_x4',
    'Restore_CNN_M',
    'Upscale_CNN_x2_M',
  ],
  'mode-ca': [
    'Clamp_Highlights',
    'Upscale_Denoise_CNN_x2_M',
    'Restore_CNN_M',
    'Upscale_CNN_x2_M',
    'AutoDownscalePre_x4',
    'Restore_CNN_M',
    'Upscale_CNN_x2_M',
  ],
  'cnn-2x-medium': ['Clamp_Highlights', 'Restore_CNN_M', 'Upscale_CNN_x2_M'],
  'cnn-2x-large': ['Clamp_Highlights', 'Restore_CNN_L', 'Upscale_CNN_x2_L'],
  'cnn-2x-very-large': ['Clamp_Highlights', 'Restore_CNN_VL', 'Upscale_CNN_x2_VL'],
  'denoise-cnn-2x-very-large': ['Clamp_Highlights', 'Upscale_Denoise_CNN_x2_VL'],
  'cnn-2x-ultra-large': ['Clamp_Highlights', 'Restore_CNN_UL', 'Upscale_CNN_x2_UL'],
  'gan-3x-large': ['Clamp_Highlights', 'Restore_GAN_UL', 'Upscale_GAN_x3_L'],
  'gan-4x-ultra-large': ['Clamp_Highlights', 'Restore_GAN_UUL', 'Upscale_GAN_x4_UUL'],
}

export const ANIME4K_OPTIONS = [
  { value: 'off', label: '关闭', description: '不处理', performance: 'light' },
  { value: 'mode-a', label: 'Mode A', description: '去压缩痕再放大（快）', performance: 'light' },
  { value: 'mode-b', label: 'Mode B', description: '轻柔去痕再放大（最快，1080P 推荐）', performance: 'light' },
  { value: 'mode-c', label: 'Mode C', description: '降噪放大再放大', performance: 'light' },
  { value: 'mode-aa', label: 'Mode A+A', description: '双重还原，画质最好一档', performance: 'medium' },
  { value: 'mode-bb', label: 'Mode B+B', description: '双次柔化还原', performance: 'medium' },
  { value: 'mode-ca', label: 'Mode C+A', description: '降噪 + 还原混合', performance: 'medium' },
  { value: 'cnn-2x-medium', label: 'CNN 2x M', description: '速度与画质平衡', performance: 'medium' },
  { value: 'cnn-2x-large', label: 'CNN 2x L', description: '更清晰，稍慢', performance: 'medium' },
  { value: 'cnn-2x-very-large', label: 'CNN 2x VL', description: '高质量网络，吃显卡', performance: 'heavy' },
  { value: 'denoise-cnn-2x-very-large', label: '降噪 CNN 2x VL', description: '边放大边去噪', performance: 'heavy' },
  { value: 'cnn-2x-ultra-large', label: 'CNN 2x UL', description: 'CNN 最高档', performance: 'heavy' },
  { value: 'gan-3x-large', label: 'GAN 3x L', description: '生成式，观感更锐', performance: 'heavy' },
  { value: 'gan-4x-ultra-large', label: 'GAN 4x UL', description: '最高规格，4K 才建议', performance: 'heavy' },
]

// Same rule Seanime uses: heavy modes make no sense on a 720p source.
export function anime4kOptionsFor(height) {
  const light = ['mode-a', 'mode-b', 'mode-aa', 'mode-bb', 'cnn-2x-medium', 'cnn-2x-very-large']
  const mid = ['mode-a', 'mode-b', 'mode-c', 'cnn-2x-medium']
  const list = !Number.isFinite(height) ? ANIME4K_OPTIONS : height <= 720 ? ANIME4K_OPTIONS.filter((o) => o.value === 'off' || light.includes(o.value)) : height <= 1080 ? ANIME4K_OPTIONS.filter((o) => o.value === 'off' || mid.includes(o.value)) : ANIME4K_OPTIONS
  return list
}

const PLAYER_CANDIDATES = [
  { id: 'mpv', label: 'mpv', commands: ['mpv', 'C:\\Software\\scoop\\apps\\mpv\\current\\mpv.com', 'C:\\Software\\scoop\\apps\\mpv\\current\\mpv.exe'] },
  { id: 'vlc', label: 'VLC', commands: ['vlc', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'] },
  { id: 'potplayer', label: 'PotPlayer', commands: ['C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe', 'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini64.exe'] },
]

export const STATE_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'state', 'dsh-anime')
const CONFIG_FILE = join(STATE_DIR, 'torrent.json')

const DEFAULT_CONFIG = {
  kind: 'builtin',
  qbittorrent: { url: 'http://127.0.0.1:8080', username: 'admin', password: '' },
  tracked: [],
}

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      qbittorrent: { ...DEFAULT_CONFIG.qbittorrent, ...(parsed.qbittorrent ?? {}) },
      tracked: Array.isArray(parsed.tracked) ? parsed.tracked : [],
    }
  } catch {
    return { ...DEFAULT_CONFIG, qbittorrent: { ...DEFAULT_CONFIG.qbittorrent }, tracked: [] }
  }
}

export async function saveConfig(config) {
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`
}

function contentTypeFor(name) {
  if (/\.(mkv)$/i.test(name)) return 'video/x-matroska'
  if (/\.(webm)$/i.test(name)) return 'video/webm'
  if (/\.(ts)$/i.test(name)) return 'video/mp2t'
  return 'video/mp4'
}

/** `bytes=start-end` → clamped [start, end]; null when the header is unusable. */
export function parseRange(header, size) {
  if (typeof header !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const hasStart = match[1] !== ''
  const hasEnd = match[2] !== ''
  if (!hasStart && !hasEnd) return null
  let start
  let end
  if (!hasStart) {
    const suffix = Number(match[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = hasEnd ? Number(match[2]) : size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start > end || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe
// ---------------------------------------------------------------------------

let ffmpegPathCache = null
let ffprobePathCache = null

async function resolveBinary(candidates, versionFlag) {
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, [versionFlag], { timeout: 8000, windowsHide: true })
      return candidate
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

export async function findFfmpeg() {
  if (ffmpegPathCache === null) ffmpegPathCache = await resolveBinary(FFMPEG_CANDIDATES, '-version')
  return ffmpegPathCache
}

async function findFfprobe() {
  if (ffprobePathCache === null) ffprobePathCache = await resolveBinary(FFPROBE_CANDIDATES, '-version')
  return ffprobePathCache
}

/**
 * How long is this stream, in seconds?
 *
 * A file carries its own answer (`format=duration` from the moov atom), and that
 * is what makes the timeline show a real total for a plain mp4 instead of
 * `--:--`. A live HLS render has no such field, so 0 means "unknown" — never a
 * guess, because the page draws a progress bar from it.
 */
export async function probeDurationSeconds(url, options = {}) {
  const headers = headerBlock(options.headers)
  const cacheKey = `duration\n${headers === '' ? url : `${url}\n${headers}`}`
  const cached = probeCache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < 30 * 60 * 1000) return cached.value
  const ffprobe = await findFfprobe()
  if (ffprobe === null) return 0
  try {
    const { stdout } = await execFileAsync(
      ffprobe,
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        ...(headers === '' ? [] : ['-headers', headers]),
        url,
      ],
      { timeout: 20000, windowsHide: true, maxBuffer: 1 << 20 },
    )
    const seconds = Number(String(stdout ?? '').trim())
    const value = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
    probeCache.set(cacheKey, { at: Date.now(), value })
    return value
  } catch {
    return 0
  }
}

const probeCache = new Map()

/**
 * ffmpeg/ffprobe take request headers as one CRLF-separated blob, and a CDN
 * that only serves with a Referer will hand back a 403 without it.
 */
function headerBlock(headers) {
  if (headers === null || typeof headers !== 'object') return ''
  const lines = Object.entries(headers)
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(([name, value]) => `${name}: ${value}`)
  return lines.length === 0 ? '' : `${lines.join('\r\n')}\r\n`
}

/** Which codecs does this stream carry? Cached per URL for 30 minutes. */
export async function probeStream(url, options = {}) {
  const headers = headerBlock(options.headers)
  const cacheKey = headers === '' ? url : `${url}\n${headers}`
  const cached = probeCache.get(cacheKey)
  if (cached !== undefined && Date.now() - cached.at < 30 * 60 * 1000) return cached.value
  const ffprobe = await findFfprobe()
  if (ffprobe === null) return { video: '', audio: '', container: '', reason: 'ffprobe 不可用' }
  try {
    const { stdout } = await execFileAsync(
      ffprobe,
      [
        '-v', 'error',
        '-show_entries', 'stream=codec_type,codec_name',
        '-show_entries', 'format=format_name',
        '-of', 'json',
        ...(headers === '' ? [] : ['-headers', headers]),
        url,
      ],
      { timeout: 20000, windowsHide: true, maxBuffer: 1 << 20 },
    )
    const parsed = JSON.parse(stdout || '{}')
    const streams = Array.isArray(parsed.streams) ? parsed.streams : []
    const video = streams.find((item) => item.codec_type === 'video')?.codec_name ?? ''
    const audio = streams.find((item) => item.codec_type === 'audio')?.codec_name ?? ''
    const value = { video, audio, container: parsed.format?.format_name ?? '', reason: '' }
    probeCache.set(cacheKey, { at: Date.now(), value })
    return value
  } catch (error) {
    return { video: '', audio: '', container: '', reason: String(error.message ?? error) }
  }
}

/**
 * Remux or transcode a source URL into fragmented MP4 on stdout.
 * `copy` keeps the original bitstreams and costs almost no CPU; it only works
 * when both codecs are already browser-safe.
 */
export async function createTranscodeStream(url, options = {}) {
  const ffmpeg = await findFfmpeg()
  if (ffmpeg === null) throw new Error('没有找到 ffmpeg，无法转码；可以用「用播放器打开」代替')
  const headers = headerBlock(options.headers)
  const probe = await probeStream(url, options)
  const videoCopy = /^(h264|avc1)$/i.test(probe.video)
  const audioCopy = /^(aac|mp3)$/i.test(probe.audio)
  // HLS carries AAC in ADTS frames, which MP4 refuses to mux verbatim
  // ("Malformed AAC bitstream detected" — ffmpeg then stops after the header,
  // which is the 6 KB stream a browser cannot play). The bitstream filter has
  // to run on exactly that input, and only on it, so it is opt-in.
  const audioFilter = String(options.audioBitstreamFilter ?? '').trim()
  const startSeconds = Number(options.startSeconds ?? 0) || 0
  const audioOnly = options.audioOnly === true
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin']
  if (startSeconds > 0) args.push('-ss', String(Math.floor(startSeconds)))
  if (headers !== '') args.push('-headers', headers)
  args.push('-i', url)
  if (audioOnly) {
    // The DASH audio track has no video stream at all, so mapping `0:v:0` here
    // made ffmpeg exit with "matches no streams" and a seek on the audio side
    // produced no bytes.
    args.push('-vn', '-map', '0:a:0')
    args.push('-c:a', audioCopy ? 'copy' : 'aac', ...(audioCopy ? [] : ['-b:a', '160k']))
    if (audioFilter !== '' && audioCopy) args.push('-bsf:a', audioFilter)
  } else {
    args.push('-map', '0:v:0', '-map', '0:a:0?')
    args.push('-c:v', videoCopy ? 'copy' : 'libx264')
    if (!videoCopy) args.push('-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p')
    args.push('-c:a', audioCopy ? 'copy' : 'aac', ...(audioCopy ? [] : ['-b:a', '160k']))
    if (audioFilter !== '' && audioCopy) args.push('-bsf:a', audioFilter)
  }
  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1')

  const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 8000) stderr = stderr.slice(-8000)
  })
  child.on('exit', () => {
    /* consumers observe the stream ending */
  })
  return { stream: child.stdout, child, probe, mode: videoCopy && audioCopy ? 'remux' : 'transcode', stderr: () => stderr }
}

// ---------------------------------------------------------------------------
// External players
// ---------------------------------------------------------------------------

let playerCache = null

export async function detectPlayers() {
  if (playerCache !== null && Date.now() - playerCache.at < 60000) return playerCache.list
  const found = []
  for (const candidate of PLAYER_CANDIDATES) {
    for (const command of candidate.commands) {
      if (isAbsolute(command)) {
        try {
          statSync(command)
          found.push({ id: candidate.id, label: candidate.label, path: command })
          break
        } catch {
          /* not here */
        }
      } else {
        try {
          await execFileAsync(command, ['--version'], { timeout: 4000, windowsHide: true })
          found.push({ id: candidate.id, label: candidate.label, path: command })
          break
        } catch {
          /* not on PATH */
        }
      }
    }
  }
  playerCache = { at: Date.now(), list: found }
  return found
}

function anime4kShaders(preset) {
  const names = ANIME4K_PRESETS[preset] ?? []
  const files = []
  for (const name of names) {
    const file = join(SHADER_DIR, `Anime4K_${name}.glsl`)
    try {
      statSync(file)
      files.push(file)
    } catch {
      /* shader pack is optional */
    }
  }
  return files
}

/** Split a command template like `mpv.exe --fs "{url}"` into exe + argv. */
function splitCommand(template) {
  const out = []
  let current = ''
  let quote = ''
  for (const char of template) {
    if (quote !== '') {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current !== '') out.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current !== '') out.push(current)
  return out
}

/**
 * Hand a stream to a desktop player.
 *
 * `options` carries everything the page knows that a player would want: where
 * to start, what to call the window, and whether to stack Anime4K shaders.
 */
export async function openInPlayer(playerId, url, options = {}) {
  const command = String(options.command ?? '').trim()
  const start = Math.max(0, Math.round(Number(options.start) || 0))
  const title = String(options.title ?? '').trim()
  const shaders = anime4kShaders(String(options.anime4k ?? 'off'))
  const glslArgs = shaders.map((file) => `--glsl-shaders-append=${file}`)

  if (command.includes('{url}')) {
    const filled = command
      .replaceAll('{url}', url)
      .replaceAll('{start}', String(start))
      .replaceAll('{title}', title)
      .replaceAll('{shaders}', glslArgs.map((arg) => arg.slice('--glsl-shaders-append='.length)).join(','))
    const argv = splitCommand(filled)
    const exe = argv.shift()
    if (exe === undefined) throw new Error('自定义播放器命令为空')
    if (options.dryRun === true) return { player: exe, template: true, argv, start, shaders: shaders.length }
    const child = spawn(exe, argv, { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    return { player: exe, template: true, start, shaders: shaders.length }
  }

  const players = await detectPlayers()
  const player = players.find((item) => item.id === playerId) ?? players[0]
  if (player === undefined) throw new Error('没有找到可用的外部播放器（mpv / VLC / PotPlayer）')
  let args
  if (player.id === 'vlc') {
    args = [url]
    if (start > 0) args.push(`--start-time=${start}`)
  } else if (player.id === 'potplayer') {
    args = [url]
    if (start > 0) args.push(`/seek=${start}`)
  } else {
    args = [url, '--force-window=yes']
    if (start > 0) args.push(`--start=${start}`)
    if (title !== '') args.push(`--title=${title}`)
    args.push(...glslArgs)
  }
  if (options.dryRun === true) return { player: player.label, path: player.path, argv: args, start, shaders: shaders.length }
  const child = spawn(player.path, args, { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
  return { player: player.label, path: player.path, start, shaders: shaders.length }
}

// ---------------------------------------------------------------------------
// Built-in WebTorrent engine
// ---------------------------------------------------------------------------

async function loadWebTorrent() {
  const module = await import('webtorrent')
  return module.default ?? module
}

function magnetHash(magnet) {
  const match = /urn:btih:([0-9a-zA-Z]+)/i.exec(String(magnet))
  if (match === null) return ''
  const raw = match[1]
  if (raw.length === 40) return raw.toLowerCase()
  if (raw.length !== 32) return ''
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of raw.toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index === -1) return ''
    bits += index.toString(2).padStart(5, '0')
  }
  let hex = ''
  for (let index = 0; index + 4 <= bits.length; index += 4) hex += parseInt(bits.slice(index, index + 4), 2).toString(16)
  return hex
}

const READY_TIMEOUT = 60000

function createBuiltinEngine(options = {}) {
  const cacheDir = options.cacheDir ?? join(STATE_DIR, 'torrents')
  const entries = new Map()
  let clientPromise = null

  async function client() {
    if (clientPromise === null) {
      clientPromise = (async () => {
        await mkdir(cacheDir, { recursive: true })
        const WebTorrent = await loadWebTorrent()
        const instance = new WebTorrent({ utp: false, maxConns: 90 })
        instance.on('error', () => {
          /* per-torrent errors are surfaced through list() */
        })
        return instance
      })()
    }
    return clientPromise
  }

  async function add(magnet) {
    const hash = magnetHash(magnet)
    if (hash === '') throw new Error('磁力链接里没有 info hash')
    if (entries.has(hash)) return entries.get(hash).torrent
    const instance = await client()
    const existing = instance.torrents.find((item) => item.infoHash === hash)
    // No `announce` override: passing a list (even an empty one) replaces the
    // magnet's own trackers, and with DHT unreliable on this network the
    // trackers are the only way metadata ever arrives.
    const torrent = existing ?? instance.add(magnet, { path: cacheDir })
    const entry = { hash, magnet, torrent, addedAt: Date.now() }
    entries.set(hash, entry)
    return torrent
  }

  function videoFiles(torrent) {
    return torrent.files
      .map((file, index) => ({ file, index }))
      .filter((item) => VIDEO_EXTENSIONS.test(item.file.name))
      .map((item) => ({
        index: item.index,
        name: item.file.name.replace(/\\/g, '/'),
        size: item.file.length,
        progress: torrent.length > 0 ? Math.min(1, item.file.downloaded / Math.max(1, item.file.length)) : 0,
        browser: BROWSER_MP4.test(item.file.name),
      }))
      .sort((left, right) => right.size - left.size)
  }

  async function list() {
    const items = []
    for (const entry of entries.values()) {
      const torrent = entry.torrent
      const ready = Boolean(torrent.ready)
      items.push({
        hash: entry.hash,
        name: torrent.name || '(正在获取元数据)',
        ready,
        progress: torrent.progress ?? 0,
        size: torrent.length ?? 0,
        formattedSize: formatBytes(torrent.length ?? 0),
        speed: torrent.downloadSpeed ?? 0,
        formattedSpeed: formatSpeed(torrent.downloadSpeed ?? 0),
        peers: torrent.numPeers ?? 0,
        status: ready ? (torrent.progress >= 1 ? 'seeding' : 'downloading') : 'metadata',
        files: ready ? videoFiles(torrent) : [],
        addedAt: entry.addedAt,
      })
    }
    return items.sort((left, right) => right.addedAt - left.addedAt)
  }

  function pick(hash, index) {
    const entry = entries.get(hash)
    if (entry === undefined) throw new Error('这个种子还没有加入下载')
    if (!entry.torrent.ready) {
      // Typed so the HTTP layer can answer 409 immediately instead of hanging on a
      // swarm that has not delivered metadata yet.
      const pending = new Error('还在获取种子元数据，请稍等')
      pending.code = 'metadata-pending'
      throw pending
    }
    if (entries.get(hash)?.torrent.files.length === 0) {
      const pending = new Error('种子信息已到，但还没有解析出文件列表')
      pending.code = 'metadata-pending'
      throw pending
    }
    const files = videoFiles(entry.torrent)
    const wanted = Number(index ?? Number.NaN)
    const chosen = Number.isFinite(wanted) ? files.find((item) => item.index === wanted) : files[0]
    if (chosen === undefined) throw new Error('这个种子里没有找到视频文件')
    return { entry, file: entry.torrent.files[chosen.index], meta: chosen }
  }

  function open(hash, index, range) {
    const { file, meta } = pick(hash, index)
    const start = range === null ? 0 : range.start
    const end = range === null ? file.length - 1 : range.end
    return {
      stream: file.createReadStream({ start, end }),
      size: file.length,
      contentType: contentTypeFor(meta.name),
      name: meta.name,
      partial: range !== null,
      range: { start, end },
    }
  }

  async function remove(hash) {
    const entry = entries.get(hash)
    if (entry === undefined) return false
    entries.delete(hash)
    await new Promise((resolve) => entry.torrent.destroy({ destroyStore: false }, resolve))
    return true
  }

  return { kind: 'builtin', label: '内置引擎', add, list, open, remove, videoFiles, magnetHash, pickInfo: pick }
}

// ---------------------------------------------------------------------------
// qBittorrent Web API client
// ---------------------------------------------------------------------------

function createQbittorrentClient(config) {
  const base = String(config.url ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
  let sid = ''
  let loginPromise = null

  async function login() {
    if (loginPromise !== null) return loginPromise
    loginPromise = (async () => {
      const body = new URLSearchParams({ username: config.username ?? '', password: config.password ?? '' })
      const response = await fetch(`${base}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', referer: base },
        body: body.toString(),
        signal: AbortSignal.timeout(15000),
      })
      const text = await response.text()
      if (!response.ok || text.trim() !== 'Ok.') throw new Error(`qBittorrent 登录失败：${text.trim() || response.status}`)
      const cookie = response.headers.getSetCookie?.() ?? []
      const sessionCookie = cookie.map((item) => /^SID=([^;]+)/.exec(item)).find(Boolean)
      if (sessionCookie === undefined) throw new Error('qBittorrent 登录失败：没有拿到 SID cookie')
      sid = `SID=${sessionCookie[1]}`
      return sid
    })().finally(() => {
      loginPromise = null
    })
    return loginPromise
  }

  async function call(path, options = {}) {
    const attempt = async () => {
      const headers = { referer: base, ...(options.headers ?? {}) }
      if (sid !== '') headers.cookie = sid
      if (options.form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded'
      return fetch(`${base}/api/v2${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.form === undefined ? undefined : new URLSearchParams(options.form).toString(),
        signal: AbortSignal.timeout(options.timeout ?? 20000),
      })
    }
    let response = await attempt()
    if (response.status === 403) {
      await login()
      response = await attempt()
    }
    return response
  }

  async function status() {
    const version = await call('/app/version', { timeout: 6000 })
    if (!version.ok) throw new Error(`qBittorrent 返回 ${version.status}`)
    const webApi = await call('/app/webapiVersion', { timeout: 6000 })
    return { ok: true, kind: 'qbittorrent', url: base, version: (await version.text()).trim(), webApiVersion: webApi.ok ? (await webApi.text()).trim() : '' }
  }

  async function add(magnet) {
    await login()
    const response = await call('/torrents/add', {
      method: 'POST',
      form: { urls: magnet, sequentialDownload: 'true', firstLastPiecePrio: 'true' },
    })
    const text = await response.text()
    if (!response.ok || !/Ok/i.test(text)) throw new Error(`qBittorrent 添加失败：${text.trim() || response.status}`)
    return magnetHash(magnet)
  }

  async function info(hashes) {
    if (hashes.length === 0) return []
    const response = await call(`/torrents/info?hashes=${encodeURIComponent(hashes.join('|'))}`)
    if (!response.ok) throw new Error(`qBittorrent torrents/info 返回 ${response.status}`)
    return response.json()
  }

  async function files(hash) {
    const response = await call(`/torrents/files?hash=${encodeURIComponent(hash)}`)
    if (!response.ok) throw new Error(`qBittorrent torrents/files 返回 ${response.status}`)
    return response.json()
  }

  async function properties(hash) {
    const response = await call(`/torrents/properties?hash=${encodeURIComponent(hash)}`)
    if (!response.ok) throw new Error(`qBittorrent torrents/properties 返回 ${response.status}`)
    return response.json()
  }

  async function list(hashes) {
    const items = await info(hashes)
    return items.map((item) => ({
      hash: String(item.hash ?? '').toLowerCase(),
      name: item.name ?? '',
      ready: Number(item.size ?? 0) > 0,
      progress: Number(item.progress ?? 0),
      size: Number(item.size ?? 0),
      formattedSize: formatBytes(Number(item.size ?? 0)),
      speed: Number(item.dlspeed ?? 0),
      formattedSpeed: formatSpeed(Number(item.dlspeed ?? 0)),
      peers: Number(item.num_leechs ?? 0) + Number(item.num_seeds ?? 0),
      status: String(item.state ?? 'unknown'),
      savePath: item.save_path ?? '',
      files: [],
    }))
  }

  async function fileList(hash) {
    const rows = await files(hash)
    return rows
      .map((row, index) => ({
        index,
        name: String(row.name ?? '').replace(/\\/g, '/'),
        size: Number(row.size ?? 0),
        progress: Number(row.progress ?? 0),
        browser: BROWSER_MP4.test(String(row.name ?? '')),
      }))
      .filter((row) => VIDEO_EXTENSIONS.test(row.name))
      .sort((left, right) => right.size - left.size)
  }

  /**
   * Resolve a torrent file to an on-disk path. Only files that qBittorrent
   * itself reports for a torrent we track are served, and the resolved path must
   * stay inside that torrent's save path.
   */
  async function resolveFile(hash, index) {
    const [propertiesRow, rows] = await Promise.all([properties(hash), files(hash)])
    const savePath = normalize(String(propertiesRow.save_path ?? ''))
    if (savePath === '') throw new Error('qBittorrent 没有报告保存路径')
    const row = rows[index]
    if (row === undefined) throw new Error('文件索引无效')
    const name = String(row.name ?? '')
    const full = normalize(join(savePath, name))
    if (full !== savePath && !full.startsWith(savePath.endsWith(sep) ? savePath : savePath + sep)) {
      throw new Error('拒绝访问保存目录以外的文件')
    }
    return { path: full, name, size: Number(row.size ?? 0), progress: Number(row.progress ?? 0) }
  }

  async function remove(hash) {
    const response = await call('/torrents/delete', { method: 'POST', form: { hashes: hash, deleteFiles: 'false' } })
    return response.ok
  }

  return { kind: 'qbittorrent', label: 'qBittorrent', status, add, list, fileList, resolveFile, remove, login, magnetHash }
}

// ---------------------------------------------------------------------------
// Facade
// ---------------------------------------------------------------------------

export async function createTorrentService(options = {}) {
  const builtin = createBuiltinEngine({ cacheDir: options.cacheDir })
  let config = await loadConfig()
  // The settings page owns kind/cacheDir/qbittorrent; its values win on startup.
  if (typeof options.kind === 'string') config.kind = options.kind === 'qbittorrent' ? 'qbittorrent' : 'builtin'
  if (options.qbittorrent !== undefined && options.qbittorrent !== null) {
    config.qbittorrent = { ...config.qbittorrent, ...options.qbittorrent }
  }

  function qb() {
    return createQbittorrentClient(config.qbittorrent)
  }

  function activeKind() {
    return config.kind === 'qbittorrent' ? 'qbittorrent' : 'builtin'
  }

  return {
    get config() {
      return config
    },
    activeKind,
    async setConfig(patch) {
      config = {
        ...config,
        ...patch,
        qbittorrent: { ...config.qbittorrent, ...(patch.qbittorrent ?? {}) },
        tracked: Array.isArray(patch.tracked) ? patch.tracked : config.tracked,
      }
      await saveConfig(config)
      return config
    },
    async status() {
      const players = await detectPlayers()
      const ffmpeg = await findFfmpeg()
      const backend = { kind: activeKind(), label: activeKind() === 'qbittorrent' ? 'qBittorrent' : '内置引擎' }
      if (activeKind() === 'qbittorrent') {
        try {
          Object.assign(backend, await qb().status())
        } catch (error) {
          backend.ok = false
          backend.error = String(error.message ?? error)
        }
      } else {
        backend.ok = true
        backend.version = 'embedded webtorrent'
      }
      return {
        backend,
        qbittorrent: { url: config.qbittorrent.url, username: config.qbittorrent.username, hasPassword: config.qbittorrent.password !== '' },
        ffmpeg: ffmpeg !== null,
        players,
        tracked: config.tracked.length,
      }
    },
    async add(magnet) {
      const hash = activeKind() === 'qbittorrent' ? await qb().add(magnet) : await builtin.add(magnet).then((torrent) => torrent.infoHash)
      if (hash !== '' && !config.tracked.includes(hash)) await this.setConfig({ tracked: [...config.tracked, hash].slice(-50) })
      return hash
    },
    async list() {
      if (activeKind() === 'qbittorrent') {
        const items = await qb().list(config.tracked)
        return { kind: 'qbittorrent', items }
      }
      return { kind: 'builtin', items: await builtin.list() }
    },
    async files(hash) {
      if (activeKind() === 'qbittorrent') {
        const [list, fileList] = await Promise.all([qb().list([hash]), qb().fileList(hash)])
        return { kind: 'qbittorrent', files: fileList, torrent: list[0] ?? null }
      }
      const items = await builtin.list()
      const item = items.find((entry) => entry.hash === hash) ?? null
      return { kind: 'builtin', files: item?.files ?? [], torrent: item }
    },
    /** Size and type of one file, without opening a byte stream. */
    async head(hash, index) {
      if (activeKind() === 'qbittorrent') {
        const resolved = await qb().resolveFile(hash, Number(index))
        let size = resolved.size
        try {
          size = statSync(resolved.path).size
        } catch {
          throw new Error('文件还没有下载到本地磁盘')
        }
        return { size, contentType: contentTypeFor(resolved.name), name: resolved.name, progress: resolved.progress }
      }
      const { meta } = builtin.pickInfo(hash, Number(index))
      return { size: meta.size, contentType: contentTypeFor(meta.name), name: meta.name, progress: meta.progress }
    },
    async open(hash, index, range) {
      if (activeKind() === 'qbittorrent') {
        const resolved = await qb().resolveFile(hash, Number(index))
        const { createReadStream } = await import('node:fs')
        let size = resolved.size
        try {
          size = statSync(resolved.path).size
        } catch {
          throw new Error('文件还没有下载到本地磁盘')
        }
        const start = range === null ? 0 : range.start
        const end = range === null ? size - 1 : Math.min(range.end, size - 1)
        return {
          stream: createReadStream(resolved.path, { start, end }),
          size,
          contentType: contentTypeFor(resolved.name),
          name: resolved.name,
          partial: range !== null,
          range: { start, end },
          progress: resolved.progress,
        }
      }
      return builtin.open(hash, Number(index), range)
    },
    async remove(hash) {
      const ok = activeKind() === 'qbittorrent' ? await qb().remove(hash) : await builtin.remove(hash)
      if (config.tracked.includes(hash)) await this.setConfig({ tracked: config.tracked.filter((item) => item !== hash) })
      return ok
    },
    openInPlayer,
  }
}
