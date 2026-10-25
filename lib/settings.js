/**
 * One settings file for the whole plugin.
 *
 * Everything the page can tune lives here: which player opens a stream, what
 * quality to ask bilibili for, where torrents and downloads are written, how to
 * reach qBittorrent, which extensions are on, and the plugin's own language.
 * The host owns the file so the settings survive a browser reload, a plugin
 * reload, and a restart.
 *
 * The shape is deliberately flat-ish and validated field by field: a settings
 * page is the easiest place to feed the backend garbage.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { STATE_DIR } from './torrent-engine.js'

export const SETTINGS_FILE = join(STATE_DIR, 'settings.json')

/** The OS "Downloads" folder — what Explorer shows as 下载. */
export function systemDownloadsDir() {
  const override = String(process.env.DSH_ANIME_DOWNLOAD_DIR ?? '').trim()
  if (override !== '') return override
  return join(homedir(), 'Downloads')
}

export const DEFAULT_SETTINGS = {
  version: 1,
  player: {
    /** inline = the page's own <video>; external = hand the URL to a desktop player. */
    mode: 'inline',
    /**
     * Which engine "inline" really means, the way seanime's Video Playback page
     * splits VideoCore (HTML5) from MpvCore: html5 keeps the page's <video>,
     * mpv starts the bundled-adjacent mpv with DASH+Anime4K support.
     */
    engine: 'builtin',
    /** mpv | vlc | potplayer | custom */
    external: 'mpv',
    /** Absolute path for `custom`, or an override for a known player. */
    command: '',
    /** Stack Anime4K shaders in mpv: off | fast | balanced | quality. */
    anime4k: 'off',
    /** Remember where an episode stopped so the player picks up there. */
    resume: true,
    /** Hand the stream to the player with the episode title as the window name. */
    titleInWindow: true,
    /** Skip the opening/ending span without asking (seanime's Skip OP/ED). */
    skipOpEd: false,
    /** Draw chapter marks on the seek bar (seanime's Show Chapter Markers). */
    chapterMarkers: true,
    /** Colour the skipped chapters differently (Highlight Skipped Chapters). */
    highlightSkipped: true,
    /** ASS style applied to bilibili subtitles when they are re-rendered. */
    subtitle: { font: 'Microsoft YaHei', size: 64, color: '#FFFFFF', outline: true, outlineSize: 3, shadow: false },
  },
  stream: {
    /** auto | anibt | animetosho — which torrent source a search starts with. */
    provider: 'auto',
    /** auto | remux | transcode — how a non-MP4 torrent is served to the page. */
    transcode: 'auto',
    /** Play the next episode when the current one ends (bilibili only). */
    autoNext: true,
  },
  torrent: {
    kind: 'builtin',
    /** Empty means `<DSH_HOME>/state/dsh-anime/torrents`. */
    cacheDir: '',
    /** KB/s cap for the embedded engine; 0 = unlimited. */
    uploadLimitKbps: 0,
    /** Drop a finished torrent from the engine after N minutes; 0 = keep. */
    autoCleanMinutes: 0,
  },
  qbittorrent: {
    url: 'http://127.0.0.1:8080',
    username: 'admin',
    password: '',
  },
  downloads: {
    /** Empty means the OS Downloads folder (see `/settings` → `paths.defaultDownloadDir`). */
    dir: '',
    /** Copy a finished torrent file into the downloads folder. */
    copyTorrents: true,
    /** Remember finished downloads in `downloads.json`. */
    keepHistory: true,
  },
  sources: {
    anilist: true,
    bangumi: true,
    bilibili: true,
    anibt: true,
    animetosho: true,
  },
  /** Per-extension settings + enable flags, keyed by extension id (see lib/extensions.js). */
  extensions: {},
  ui: {
    defaultTab: 'season',
    /** Page-wide labels on torrent rows (size / resolution / seeders). */
    verboseTorrentRows: true,
    /** Which title variant the lists show: romaji | native | chinese | english. */
    titleLanguage: 'chinese',
    /** The plugin's own interface language: auto follows the harness. */
    locale: 'auto',
  },
}

export const TITLE_LANGUAGES = ['romaji', 'native', 'chinese', 'english']
export const UI_LOCALES = ['auto', 'zh', 'en']
const PROVIDERS = ['auto', 'anibt', 'animetosho']
const TRANSCODES = ['auto', 'remux', 'transcode']
const PLAYER_MODES = ['inline', 'external']
/** html5 = the page's own <video>; mpv = embedded mpv (seanime's MpvCore). */
/**
 * `builtin` is the self-written player, shipped as **PrismFlow** (DASH video +
 * audio merged through MSE, libass subtitles, sharpening/super-resolution).
 * `mpv` is the native-renderer escape hatch. The stored ids stay stable so old
 * settings keep working; the display name lives in the client.
 */
const PLAYER_ENGINES = ['builtin']
const EXTERNALS = ['mpv', 'vlc', 'potplayer', 'custom']
/**
 * Anime4K presets the player can actually run. These are the Seanime modes the
 * WebGPU shader pack ships with; the old list only knew the mpv names, so every
 * preset chosen in the settings page was rejected and stored back as "off".
 */
const ANIME4K_MODES = [
  'off',
  'mode-a',
  'mode-b',
  'mode-c',
  'mode-aa',
  'mode-bb',
  'mode-ca',
  'cnn-2x-medium',
  'cnn-2x-large',
  'cnn-2x-very-large',
  'denoise-cnn-2x-very-large',
  'cnn-2x-ultra-large',
  'gan-3x-large',
  'gan-4x-ultra-large',
]
const ENGINE_KINDS = ['builtin', 'qbittorrent']
const TABS = ['season', 'airing', 'search', 'mine', 'sources', 'downloads', 'settings']

function pickEnum(value, allowed, fallback) {
  const text = String(value ?? '').trim()
  return allowed.includes(text) ? text : fallback
}

function pickBool(value, fallback) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function pickInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  const rounded = Math.round(number)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

function pickText(value, fallback, maxLength = 400) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (text.length > maxLength) return fallback
  return text
}

/** Extension settings stay open-ended: the registry validates them per manifest. */
function mergeExtensions(incoming, base) {
  const safe = base !== null && typeof base === 'object' ? base : {}
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) return { ...safe }
  const next = { ...safe }
  for (const [id, values] of Object.entries(incoming)) {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) continue
    const current = next[id] !== null && typeof next[id] === 'object' ? next[id] : {}
    next[id] = { ...current, ...values }
  }
  return next
}

/** Accept anything, return settings that are guaranteed to be sane. */
export function coerceSettings(input, base = DEFAULT_SETTINGS) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const player = raw.player ?? {}
  const stream = raw.stream ?? {}
  const torrent = raw.torrent ?? {}
  const qb = raw.qbittorrent ?? {}
  const downloads = raw.downloads ?? {}
  const sources = raw.sources ?? {}
  const ui = raw.ui ?? {}

  return {
    version: 1,
    player: {
      mode: pickEnum(player.mode, PLAYER_MODES, base.player.mode),
      engine: 'builtin',
      external: pickEnum(player.external, EXTERNALS, base.player.external),
      command: pickText(player.command, base.player.command),
      anime4k: pickEnum(player.anime4k, ANIME4K_MODES, base.player.anime4k),
      resume: pickBool(player.resume, base.player.resume),
      titleInWindow: pickBool(player.titleInWindow, base.player.titleInWindow),
      skipOpEd: pickBool(player.skipOpEd, base.player.skipOpEd),
      chapterMarkers: pickBool(player.chapterMarkers, base.player.chapterMarkers),
      highlightSkipped: pickBool(player.highlightSkipped, base.player.highlightSkipped),
      subtitle: {
        font: pickText(player.subtitle?.font, base.player.subtitle.font),
        size: pickInt(player.subtitle?.size, base.player.subtitle.size, 12, 160),
        color: /^#[0-9a-fA-F]{6}$/.test(String(player.subtitle?.color ?? '')) ? String(player.subtitle.color) : base.player.subtitle.color,
        outline: pickBool(player.subtitle?.outline, base.player.subtitle.outline),
        outlineSize: pickInt(player.subtitle?.outlineSize, base.player.subtitle.outlineSize, 1, 6),
        shadow: pickBool(player.subtitle?.shadow, base.player.subtitle.shadow),
      },
    },
    stream: {
      provider: pickEnum(stream.provider, PROVIDERS, base.stream.provider),
      transcode: pickEnum(stream.transcode, TRANSCODES, base.stream.transcode),
      autoNext: pickBool(stream.autoNext, base.stream.autoNext),
    },
    torrent: {
      kind: pickEnum(torrent.kind, ENGINE_KINDS, base.torrent.kind),
      cacheDir: pickText(torrent.cacheDir, base.torrent.cacheDir),
      uploadLimitKbps: pickInt(torrent.uploadLimitKbps, base.torrent.uploadLimitKbps, 0, 1000000),
      autoCleanMinutes: pickInt(torrent.autoCleanMinutes, base.torrent.autoCleanMinutes, 0, 100000),
    },
    qbittorrent: {
      url: pickText(qb.url, base.qbittorrent.url),
      username: pickText(qb.username, base.qbittorrent.username),
      // An empty password means "keep the stored one", never "clear it".
      password: pickText(qb.password, base.qbittorrent.password),
    },
    downloads: {
      dir: pickText(downloads.dir, base.downloads.dir),
      copyTorrents: pickBool(downloads.copyTorrents, base.downloads.copyTorrents),
      keepHistory: pickBool(downloads.keepHistory, base.downloads.keepHistory),
    },
    sources: {
      anilist: pickBool(sources.anilist, base.sources.anilist),
      bangumi: pickBool(sources.bangumi, base.sources.bangumi),
      bilibili: pickBool(sources.bilibili, base.sources.bilibili),
      anibt: pickBool(sources.anibt, base.sources.anibt),
      animetosho: pickBool(sources.animetosho, base.sources.animetosho),
    },
    extensions: mergeExtensions(raw.extensions, base.extensions),
    ui: {
      defaultTab: pickEnum(ui.defaultTab, TABS, base.ui.defaultTab),
      verboseTorrentRows: pickBool(ui.verboseTorrentRows, base.ui.verboseTorrentRows),
      titleLanguage: pickEnum(ui.titleLanguage, TITLE_LANGUAGES, base.ui.titleLanguage),
      locale: pickEnum(ui.locale, UI_LOCALES, base.ui.locale),
    },
  }
}

export async function loadSettings() {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8')
    return coerceSettings(JSON.parse(raw))
  } catch {
    return coerceSettings({})
  }
}

export async function saveSettings(patch) {
  const current = await loadSettings()
  const next = coerceSettings(patch, current)
  // Secrets are write-only: a blank password keeps whatever is stored.
  if (patch?.qbittorrent !== undefined && patch.qbittorrent.password === '') {
    next.qbittorrent.password = current.qbittorrent.password
  }
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function resetSettings() {
  const defaults = coerceSettings({})
  await mkdir(STATE_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(defaults, null, 2), 'utf8')
  return defaults
}

/** Resolved paths, so the settings page can show where things land. */
export function resolvePaths(settings) {
  const cacheDir = settings.torrent.cacheDir === '' ? join(STATE_DIR, 'torrents') : settings.torrent.cacheDir
  const defaultDownloadDir = systemDownloadsDir()
  const downloadDir = settings.downloads.dir === '' ? defaultDownloadDir : settings.downloads.dir
  return { stateDir: STATE_DIR, cacheDir, downloadDir, defaultDownloadDir, settingsFile: SETTINGS_FILE }
}

/** What the torrent engine needs; a changed value means rebuilding it. */
export function engineOptions(settings) {
  return {
    kind: settings.torrent.kind,
    cacheDir: resolvePaths(settings).cacheDir,
    qbittorrent: settings.qbittorrent,
  }
}

/** The settings the page is allowed to see: no password ever goes back out. */
export function publicSettings(settings) {
  return {
    ...settings,
    qbittorrent: { ...settings.qbittorrent, password: settings.qbittorrent.password === '' ? '' : '********' },
  }
}
