// Chapters come from the container, and only torrent/local playback has one.
// bilibili's DASH track carries no chapter metadata, so the page shows no marks
// there — that is the same situation seanime is in for a raw stream.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const FFPROBE_CANDIDATES = [
  'ffprobe',
  'C:\\Program Files (x86)\\ffmpeg\\bin\\ffprobe.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe',
]

let probeCache = null
async function findProbe() {
  if (probeCache !== null) return probeCache
  for (const candidate of FFPROBE_CANDIDATES) {
    try {
      await execFileAsync(candidate, ['-version'], { timeout: 8000, windowsHide: true })
      probeCache = candidate
      return probeCache
    } catch {
      /* next */
    }
  }
  probeCache = null
  return null
}

/** Opening / ending style titles, the ones seanime highlights and can skip. */
const SKIP_PATTERN = /\b(?:op|ed|opening|ending|nced|ncop|intro|outro)\b|片头|片尾|片头曲|片尾曲|オープニング|エンディング/i

const chaptersCache = new Map()

/**
 * Read ffprobe's chapter list from a local path or an http(s) stream url.
 * Returns `{ ok, chapters: [{ title, start, end, skip }] }`.
 */
export async function readChapters(target, { timeoutMs = 20000 } = {}) {
  const key = String(target)
  const cached = chaptersCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < 10 * 60 * 1000) return cached.value
  const probe = await findProbe()
  if (probe === null) return { ok: false, chapters: [], error: { message: 'ffprobe 不可用' } }
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_chapters',
    '-show_entries', 'chapter=start_time,end_time:chapter_tags=title',
    '-i', key,
  ]
  let stdout = ''
  try {
    const result = await execFileAsync(probe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    stdout = result.stdout ?? ''
  } catch (error) {
    const partial = typeof error?.stdout === 'string' ? error.stdout : ''
    if (partial.trim() === '') {
      return { ok: false, chapters: [], error: { message: String(error?.message ?? error).split('\n')[0] } }
    }
    stdout = partial
  }
  let parsed = null
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, chapters: [], error: { message: 'ffprobe 输出不是 JSON' } }
  }
  const list = Array.isArray(parsed?.chapters) ? parsed.chapters : []
  const chapters = list
    .map((item, index) => {
      const start = Number(item?.start_time ?? 0)
      const end = Number(item?.end_time ?? 0)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
      const title = String(item?.tags?.title ?? `章节 ${index + 1}`).trim()
      return { title, start, end, skip: SKIP_PATTERN.test(title) }
    })
    .filter((item) => item !== null)
  const value = { ok: true, chapters }
  chaptersCache.set(key, { at: Date.now(), value })
  return value
}

/** Forget cached chapters (used by the stream-cache button). */
export function clearChapterCache() {
  chaptersCache.clear()
}
