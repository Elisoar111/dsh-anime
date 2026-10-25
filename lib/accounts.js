/**
 * Account storage: one credential file, plus the two helpers an account
 * provider needs (a JSON fetch and a QR image).
 *
 * The providers themselves live in their extensions — bilibili scans a QR and
 * hands back its own cookies, AniList and Bangumi hand back a token — so this
 * module never learns which providers exist. It only stores what a provider
 * verified, and masks it for the page.
 *
 * On disk (version 2):
 *
 *   { "version": 2, "providers": { "bilibili": { "secret": "...", "fields": {...}, "savedAt": 1 } } }
 *
 * Version 1 files (one hardcoded slot per provider: `cookie`, `token`, `mid`,
 * `uname`, `face`, …) are read and upgraded in place on the next save.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ACCOUNTS_VERSION = 2

function text(value, limit = 8192) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

/** Version 1 spelled each provider's fields out; keep what still means something. */
function migrateLegacyEntry(entry) {
  const secret = text(entry.cookie) || text(entry.token)
  if (secret === '') return null
  const legacyCookie = text(entry.cookie) !== ''
  return {
    secret,
    fields: legacyCookie
      ? {
          uid: Number.isFinite(entry.mid) ? entry.mid : null,
          name: text(entry.uname, 120),
          avatar: text(entry.face, 512),
        }
      : {
          uid: Number.isFinite(entry.userId) ? entry.userId : null,
          name: text(entry.userName, 120),
          avatar: text(entry.avatar, 512),
        },
    savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : null,
  }
}

function normalize(raw) {
  const providers = {}
  if (raw === null || typeof raw !== 'object') return { version: ACCOUNTS_VERSION, providers }
  const shaped = raw.providers !== null && typeof raw.providers === 'object' ? raw.providers : null
  if (shaped !== null) {
    for (const [id, entry] of Object.entries(shaped)) {
      if (id === '' || entry === null || typeof entry !== 'object') continue
      const secret = text(entry.secret)
      if (secret === '') continue
      providers[id] = {
        secret,
        fields: entry.fields !== null && typeof entry.fields === 'object' ? entry.fields : {},
        savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : null,
      }
    }
    return { version: ACCOUNTS_VERSION, providers }
  }
  for (const [id, entry] of Object.entries(raw)) {
    if (entry === null || typeof entry !== 'object') continue
    const migrated = migrateLegacyEntry(entry)
    if (migrated !== null) providers[id] = migrated
  }
  return { version: ACCOUNTS_VERSION, providers }
}

export function createAccountStore(stateDir) {
  const file = join(stateDir, 'accounts.json')
  let cache = null
  let stamp = null

  function ensureDir() {
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true })
  }

  /** Seconds of mtime resolution are coarse on some Windows volumes. */
  function fileStamp() {
    try {
      const stat = statSync(file)
      return `${stat.mtimeMs}:${stat.size}`
    } catch {
      return 'missing'
    }
  }

  function load() {
    const now = fileStamp()
    if (cache !== null && now === stamp) return cache
    try {
      cache = normalize(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      cache = { version: ACCOUNTS_VERSION, providers: {} }
    }
    stamp = now
    return cache
  }

  function save(next) {
    cache = normalize(next)
    ensureDir()
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(cache, null, 2), 'utf8')
    renameSync(temp, file)
    stamp = fileStamp()
    return cache
  }

  /** The stored credential of one provider, secret included — Host-side only. */
  function get(id) {
    const entry = load().providers[id]
    return entry === undefined ? null : entry
  }

  /** Store what a provider verified: `{ secret, fields }`. */
  function set(id, saved) {
    const next = load()
    const fields = saved?.fields !== null && typeof saved?.fields === 'object' ? saved.fields : {}
    return save({
      version: ACCOUNTS_VERSION,
      providers: {
        ...next.providers,
        [id]: {
          secret: text(saved?.secret),
          fields,
          savedAt: typeof saved?.savedAt === 'number' ? saved.savedAt : Date.now(),
        },
      },
    })
  }

  function clear(id) {
    const next = load()
    const providers = { ...next.providers }
    delete providers[id]
    return save({ version: ACCOUNTS_VERSION, providers })
  }

  return { file, load, save, get, set, clear }
}

/** What the page is allowed to see: never the secret itself. */
export function publicAccounts(state) {
  const mask = (value) => {
    if (typeof value !== 'string' || value === '') return ''
    if (value.length <= 8) return '••••'
    return `${value.slice(0, 3)}••••${value.slice(-3)}`
  }
  const providers = state?.providers !== null && typeof state?.providers === 'object' ? state.providers : {}
  const view = {}
  for (const [id, entry] of Object.entries(providers)) {
    const fields = entry?.fields !== null && typeof entry?.fields === 'object' ? entry.fields : {}
    view[id] = {
      loggedIn: typeof entry?.secret === 'string' && entry.secret !== '',
      name: text(fields.name, 120),
      avatar: text(fields.avatar, 512),
      uid: Number.isFinite(fields.uid) ? fields.uid : null,
      masked: mask(entry?.secret ?? ''),
      savedAt: typeof entry?.savedAt === 'number' ? entry.savedAt : null,
    }
  }
  return view
}

/** One JSON round-trip with a timeout — the shape every provider needs. */
export async function httpJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const body = await response.text()
    let payload = null
    try {
      payload = JSON.parse(body)
    } catch {
      payload = null
    }
    return { status: response.status, payload, headers: response.headers }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A data URL for the QR. `qrcode` is only present when the profile already has
 * it; without it we fall back to a public renderer rather than showing a login
 * key the user cannot scan.
 */
export async function renderQr(value) {
  try {
    const module = await import('qrcode')
    const make = module?.default?.toDataURL ?? module?.toDataURL
    if (typeof make === 'function') {
      const dataUrl = await make(value, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) return { image: dataUrl, source: 'local' }
    }
  } catch {
    /* fall through to the remote renderer */
  }
  return {
    image: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`,
    source: 'remote',
  }
}
