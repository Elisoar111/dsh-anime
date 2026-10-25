/**
 * Frame pipeline ("like seanime", but rendered by ffmpeg instead of libmpv).
 *
 * seanime's embedded player is libmpv inside the Electron renderer (mpv-prism,
 * a native addon). A plugin cannot install a native video surface into DSH, so
 * the equivalent is done one layer down: ffmpeg decodes the two DASH tracks,
 * runs the Anime4K hooks through libplacebo on the GPU, burns ASS subtitles with
 * libass, and encodes a fragmented MP4 that a plain <video> in the page plays.
 *
 * That keeps everything the user actually asked for -- real Anime4K shaders and
 * ASS styling -- while the picture stays inside the page.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ANIME4K_PRESETS, SHADER_DIR } from './torrent-engine.js'

const WORK_DIR = join(tmpdir(), 'dsh-anime-render')

/**
 * ffmpeg's filter parser keeps everything inside single quotes literal, so a
 * Windows path with spaces and parentheses only needs the quotes: escaping the
 * colon inside them would put a literal backslash into the filename.
 */
function filterPath(path) {
  const normalised = path.replace(/\\/g, '/').replace(/'/g, '\\\'')
  return `'${normalised}'`
}

/** The Anime4K hooks for a preset, as libplacebo filters (one pass per hook). */
export function shaderFilters(preset) {
  const names = ANIME4K_PRESETS[preset] ?? []
  const out = []
  for (const name of names) {
    const file = join(SHADER_DIR, `Anime4K_${name}.glsl`)
    try {
      statSync(file)
      out.push(`libplacebo=custom_shader_path=${filterPath(file)}`)
    } catch {
      /* the pack is optional; a missing hook is skipped, not fatal */
    }
  }
  return out
}

/** `ass=` first (subtitles belong on the unscaled frame), then the hooks. */
export function buildFilterChain(preset, assPath) {
  const chain = []
  if (typeof assPath === 'string' && assPath !== '') chain.push(`ass=filename=${filterPath(assPath)}`)
  chain.push(...shaderFilters(preset))
  return chain
}

function assTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = (total % 60).toFixed(2).padStart(5, '0')
  return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`
}

function escapeAss(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N')
}

/**
 * Bilibili subtitle JSON (`{"body":[{"from":1.2,"to":3.4,"content":"…"}]}` or
 * the newer `{"body":[{"from","to","content"}]}`) to a minimal ASS script.
 */
const assColor = (hex, fallback = 'FFFFFF') => {
  const raw = String(hex ?? '').replace('#', '').trim()
  const value = /^[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase().replace('&H00', '&H00')
}

export function subtitleToAss(payload, title = '', style = {}) {
  const font = typeof style.font === 'string' && style.font !== '' ? style.font.replace(/,/g, ' ') : 'Microsoft YaHei'
  const size = Number.isFinite(Number(style.size)) ? Math.max(12, Math.min(160, Math.round(Number(style.size)))) : 64
  const primary = assColor(style.color, 'FFFFFF')
  const outline = style.outline === false ? 0 : Math.max(1, Math.min(6, Math.round(Number(style.outlineSize) || 3)))
  const shadow = style.shadow === true ? 2 : 0
  const cues = Array.isArray(payload?.body) ? payload.body : []
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${size},${primary},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${outline},${shadow},2,40,40,60,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  const events = cues
    .filter((cue) => typeof cue?.content === 'string' && cue.content !== '')
    .map((cue) => `Dialogue: 0,${assTime(cue.from)},${assTime(cue.to)},Default,,0,0,0,,${escapeAss(cue.content)}`)
  return `${header.join('\n')}\n${events.join('\n')}\n`
}

/** Write the ASS script next to the other render scratch files and return it. */
export function writeAssScript(name, payload, title = '') {
  mkdirSync(WORK_DIR, { recursive: true })
  const file = join(WORK_DIR, `${String(name).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60)}.ass`)
  writeFileSync(file, subtitleToAss(payload, title), 'utf8')
  return file
}

const HEADER_FILTER = /^[\w-]+:/

/**
 * Spawn ffmpeg for one render. Returns the child plus the argv that produced it
 * (the argv is what the tests and the log inspect).
 */
export function startRender({
  videoUrl,
  audioUrl = '',
  headers = null,
  start = 0,
  preset = 'off',
  assPath = '',
  duration = 0,
  width = 0,
  height = 0,
} = {}) {
  if (typeof videoUrl !== 'string' || videoUrl === '') throw new Error('缺少视频地址')
  const headerBlock = Object.entries(headers ?? {})
    .filter(([key, value]) => HEADER_FILTER.test(key) && typeof value === 'string' && value !== '')
    .map(([key, value]) => `${key}: ${value}\r\n`)
    .join('')
  const args = ['-hide_banner', '-loglevel', 'error']
  if (headerBlock !== '') args.push('-headers', headerBlock)
  if (start > 0) args.push('-ss', String(Math.floor(start)))
  args.push('-i', videoUrl)
  if (audioUrl !== '') {
    if (headerBlock !== '') args.push('-headers', headerBlock)
    args.push('-i', audioUrl)
  }
  args.push('-map', '0:v:0')
  if (audioUrl !== '') args.push('-map', '1:a:0?')
  const chain = buildFilterChain(preset, assPath)
  if (width > 0 && height > 0) chain.push(`scale=${Math.round(width)}:${Math.round(height)}`)
  if (chain.length > 0) args.push('-vf', chain.join(','))
  if (duration > 0) args.push('-t', String(Math.ceil(duration)))
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'animation',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  )
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  return { child, args }
}
