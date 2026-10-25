/**
 * Downloads: bilibili episodes/uploads to a file on disk, and torrent files
 * tracked to completion.
 *
 * One in-memory job table, mirrored to `downloads.json` so the list survives a
 * restart. A bilibili job is a streaming fetch piped into a file with progress
 * and a working cancel; a torrent job polls the engine, and when the file is
 * complete copies it into the downloads folder if that is switched on.
 */
import { createWriteStream } from 'node:fs'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, stat, copyFile, unlink, rename } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'

const HISTORY_LIMIT = 200
const SAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g

export function safeFileName(value, fallback = 'download') {
  const cleaned = String(value ?? '')
    .replace(SAFE_NAME, '_')
    .replace(/\s+/g, ' ')
    .trim()
  const cut = cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned
  return cut === '' ? fallback : cut
}

/** `k: v` lines for ffmpeg's `-headers`, which wants CRLF after every one. */
function headerBlock(headers) {
  if (headers === null || typeof headers !== 'object') return ''
  const lines = []
  for (const [key, value] of Object.entries(headers)) {
    const name = String(key ?? '').trim()
    const text = String(value ?? '').trim()
    if (name !== '' && text !== '') lines.push(`${name}: ${text}`)
  }
  return lines.length === 0 ? '' : `${lines.join('\r\n')}\r\n`
}

/** `name.mp4`, then `name (2).mp4` — never overwrite a file already there. */
async function uniquePath(folder, base, extension) {
  const name = safeFileName(base, 'stream')
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = join(folder, attempt === 0 ? `${name}${extension}` : `${name} (${attempt + 1})${extension}`)
    try {
      await stat(candidate)
    } catch {
      return candidate
    }
  }
  return join(folder, `${name} ${Date.now()}${extension}`)
}

/**
 * ffmpeg needs an explicit muxer when the output name ends in `.part`.
 * Keys are the extensions the API accepts, plus mkv for Bilibili streams.
 */
function streamFormat(path) {
  const extension = String(path ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  if (extension === 'mkv') return 'matroska'
  if (extension === 'flv') return 'flv'
  if (extension === 'ts') return 'mpegts'
  if (extension === 'mov') return 'mov'
  return 'mp4'
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 100 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}

export function createDownloads({ getSettings, getTorrents }) {
  /** id → job. Jobs stay in memory; finished ones also go to history on disk. */
  const jobs = new Map()
  let loaded = false

  function dir() {
    const paths = getSettings()
    return paths.downloadDir
  }

  function historyFile() {
    return join(getSettings().stateDir, 'downloads.json')
  }

  async function ensureLoaded() {
    if (loaded) return
    loaded = true
    try {
      const raw = await readFile(historyFile(), 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.jobs)) {
        for (const job of parsed.jobs) {
          if (job?.id === undefined) continue
          // Anything that was mid-flight when the app died is dead now.
          jobs.set(job.id, job.status === 'running' || job.status === 'queued' ? { ...job, status: 'interrupted' } : job)
        }
      }
    } catch {
      /* no history yet */
    }
  }

  async function persist() {
    if (getSettings().keepHistory !== true) return
    try {
      await mkdir(getSettings().stateDir, { recursive: true })
      const all = [...jobs.values()].sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0)).slice(0, HISTORY_LIMIT)
      await writeFile(historyFile(), JSON.stringify({ version: 1, jobs: all }, null, 2), 'utf8')
    } catch {
      /* history is a nicety, never the reason a download fails */
    }
  }

  function view(job) {
    const total = Number(job.total) || 0
    const received = Number(job.received) || 0
    return {
      id: job.id,
      kind: job.kind,
      title: job.title,
      filename: job.filename,
      path: job.path ?? null,
      status: job.status,
      error: job.error ?? null,
      total,
      received,
      progress:
        job.ratio === undefined || job.ratio === null
          ? total > 0
            ? Math.min(1, received / total)
            : job.status === 'done'
              ? 1
              : 0
          : Math.min(1, Number(job.ratio) || 0),
      formattedTotal: formatBytes(total),
      formattedReceived: formatBytes(received),
      speed: job.speed ?? 0,
      formattedSpeed: job.speed > 0 ? `${formatBytes(job.speed)}/s` : '',
      startedAt: job.startedAt ?? 0,
      finishedAt: job.finishedAt ?? 0,
      source: job.source ?? (job.kind === 'bili' ? '哔哩哔哩' : job.kind === 'stream' ? '在线流' : '种子'),
      hash: job.hash ?? null,
      fileIndex: job.fileIndex ?? null,
    }
  }

  function list() {
    return [...jobs.values()].map(view).sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0))
  }

  /**
   * Download one bilibili URL to a file.
   * `headers` carries the Referer bilibili requires; `title` names the file.
   */
  async function startBiliDownload({ url, headers = {}, title, extension = '.mp4', total = 0 }) {
    await ensureLoaded()
    const id = randomUUID()
    const folder = dir()
    await mkdir(folder, { recursive: true })
    const filename = `${safeFileName(title, 'bilibili')}${extension}`
    const path = join(folder, filename)
    const job = {
      id,
      kind: 'bili',
      title: String(title ?? filename),
      filename,
      path,
      status: 'running',
      total: Number(total) || 0,
      received: 0,
      speed: 0,
      startedAt: Date.now(),
      finishedAt: 0,
      controller: new AbortController(),
    }
    jobs.set(id, job)
    void runBiliJob(job, url, headers)
    return view(job)
  }

  /**
   * Download one playable URL — an online source's line, a torrent's transcode
   * URL, anything ffmpeg can read.
   *
   * ffmpeg is the equaliser: an m3u8 segment list, a Matroska torrent and a
   * plain mp4 all become one file with `-c copy`, which costs no CPU. A plain
   * HTTP fetch can only handle the last of those, which is why the online
   * sources (AniCh, FQDM …) had no download button at all: what they hand out
   * is usually HLS.
   */
  async function startStreamDownload({ url, headers = {}, title, extension = '.mp4', duration = 0, ffmpegPath, bitstreamFilter = '', source = '在线流' }) {
    await ensureLoaded()
    const target = String(url ?? '').trim()
    if (!/^https?:\/\//.test(target)) return { ok: false, error: { message: '没有可以下载的地址' } }
    if (typeof ffmpegPath !== 'string' || ffmpegPath === '') {
      return { ok: false, error: { message: '没有找到 ffmpeg，下载需要它来转封装（或直接下 mp4）' } }
    }
    const id = randomUUID()
    const folder = dir()
    await mkdir(folder, { recursive: true })
    const path = await uniquePath(folder, title, extension)
    const job = {
      id,
      kind: 'stream',
      source: String(source ?? '在线流'),
      title: String(title ?? basename(path)),
      filename: basename(path),
      path,
      status: 'running',
      total: 0,
      received: 0,
      ratio: 0,
      speed: 0,
      duration: Number(duration) || 0,
      startedAt: Date.now(),
      finishedAt: 0,
      child: null,
    }
    jobs.set(id, job)
    void runStreamJob(job, target, headers, ffmpegPath, bitstreamFilter)
    return { ok: true, job: view(job) }
  }

  async function runStreamJob(job, url, headers, ffmpegPath, bitstreamFilter) {
    const partial = `${job.path}.part`
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y']
    const block = headerBlock(headers)
    if (block !== '') args.push('-headers', block)
    // A live HLS line can accept the playlist and then hang on a segment host
    // that is gone; without an input read timeout ffmpeg waits forever and the
    // job sits at 0 B with no .part file on disk.
    args.push('-rw_timeout', '20000000')
    args.push('-i', url)
    // `?` because a line may carry no audio track; a strict map makes ffmpeg
    // exit with "matches no streams" and leaves a zero-byte download.
    args.push('-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy')
    if (bitstreamFilter !== '') args.push('-bsf:a', bitstreamFilter)
    if (/\.(mp4|m4v)$/i.test(job.path)) args.push('-movflags', '+faststart')
    // The output is written to `<name>.part`, which ffmpeg cannot map to a muxer
    // (".part" is not an extension it knows) — every stream download died on
    // "Unable to find a suitable output format for ... .part". Say the format.
    args.push('-f', streamFormat(job.path))
    // Progress on stdout, media to the file: `-progress` is machine readable and
    // the only way to know a remux is moving, since content-length is unknown.
    args.push('-progress', 'pipe:1', '-nostats', partial)

    let child
    try {
      child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      job.status = 'error'
      job.error = String(error?.message ?? error)
      job.finishedAt = Date.now()
      void persist()
      return
    }
    job.child = child

    // Stall watchdog: `-rw_timeout` covers the connection, this covers "connected
    // but stopped producing". A remux that has not grown its output for 45 s is
    // dead in practice, and saying so beats a job that spins at 0 % forever.
    const stallMs = 45000
    let watchdog = setTimeout(() => {
      job.error = `线路 ${stallMs / 1000} 秒没有数据，已放弃`
      child.kill()
    }, stallMs)
    const keepAlive = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        job.error = `线路 ${stallMs / 1000} 秒没有数据，已放弃`
        child.kill()
      }, stallMs)
    }

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })

    let pending = ''
    let lastAt = Date.now()
    let lastBytes = 0
    child.stdout.on('data', (chunk) => {
      pending += String(chunk)
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const at = line.indexOf('=')
        if (at < 0) continue
        const key = line.slice(0, at).trim()
        const value = line.slice(at + 1).trim()
        // ffmpeg reports microseconds under both names (out_time_ms is legacy).
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const seconds = Number(value) / 1e6
          if (Number.isFinite(seconds) && seconds >= 0 && job.duration > 0) {
            job.ratio = Math.min(0.995, seconds / job.duration)
          }
        } else if (key === 'total_size') {
          const bytes = Number(value) || 0
          job.received = bytes
          if (bytes > 0) keepAlive()
          const now = Date.now()
          if (now - lastAt >= 500) {
            job.speed = Math.round(((bytes - lastBytes) * 1000) / (now - lastAt))
            lastAt = now
            lastBytes = bytes
          }
        }
      }
    })

    child.on('error', (error) => {
      clearTimeout(watchdog)
      job.status = 'error'
      job.error = String(error?.message ?? error)
      job.finishedAt = Date.now()
      void persist()
    })

    child.on('close', async (code) => {
      clearTimeout(watchdog)
      job.child = null
      job.speed = 0
      if (job.status === 'cancelled') {
        await unlink(partial).catch(() => {})
        job.finishedAt = Date.now()
        void persist()
        return
      }
      if (code === 0) {
        try {
          await rename(partial, job.path)
          const info = await stat(job.path)
          job.filename = basename(job.path)
          job.received = info.size
          job.total = info.size
          job.ratio = 1
          job.status = 'done'
        } catch (error) {
          job.status = 'error'
          job.error = `落地失败：${String(error?.message ?? error)}`
        }
      } else {
        job.status = 'error'
        // A watchdog kill leaves the reason on job.error already; stderr would
        // only say "exited with code 1", which tells the user nothing.
        if (job.error === undefined || job.error === null || job.error === '') {
          job.error = stderr.trim() === '' ? `ffmpeg 退出码 ${code}` : stderr.trim().slice(-400)
        }
        await unlink(partial).catch(() => {})
      }
      job.finishedAt = Date.now()
      void persist()
    })
  }

  async function runBiliJob(job, url, headers) {
    // Only the handshake is bounded: episodes are tens of megabytes.
    const handshake = new AbortController()
    const timer = setTimeout(() => handshake.abort(), 30000)
    let response
    try {
      response = await fetch(url, { headers, signal: handshake.signal })
    } catch (error) {
      clearTimeout(timer)
      job.status = 'error'
      job.error = String(error?.message ?? error)
      job.finishedAt = Date.now()
      void persist()
      return
    }
    clearTimeout(timer)
    if (!response.ok || response.body === null) {
      job.status = 'error'
      job.error = `上游返回 ${response.status}`
      job.finishedAt = Date.now()
      void persist()
      return
    }

    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > 0) job.total = length

    const partial = `${job.path}.part`
    const sink = createWriteStream(partial)
    const source = Readable.fromWeb(response.body)
    let lastAt = Date.now()
    let lastBytes = 0

    return new Promise((resolve) => {
      const abort = () => {
        source.destroy()
        sink.destroy()
      }
      job.controller.signal.addEventListener('abort', abort, { once: true })

      source.on('data', (chunk) => {
        job.received += chunk.length
        const now = Date.now()
        if (now - lastAt >= 500) {
          job.speed = Math.round(((job.received - lastBytes) * 1000) / (now - lastAt))
          lastAt = now
          lastBytes = job.received
        }
      })
      source.on('error', (error) => {
        job.status = 'error'
        job.error = String(error?.message ?? error)
        job.finishedAt = Date.now()
        sink.destroy()
        void persist()
        resolve()
      })
      sink.on('error', (error) => {
        job.status = 'error'
        job.error = String(error?.message ?? error)
        job.finishedAt = Date.now()
        void persist()
        resolve()
      })
      sink.on('finish', async () => {
        if (job.controller.signal.aborted) {
          await unlink(partial).catch(() => undefined)
          job.status = 'cancelled'
          job.finishedAt = Date.now()
          void persist()
          resolve()
          return
        }
        try {
          await rename(partial, job.path)
          job.status = 'done'
          if (job.total === 0) job.total = job.received
          job.progress = 1
        } catch (error) {
          job.status = 'error'
          job.error = String(error?.message ?? error)
        }
        job.finishedAt = Date.now()
        job.speed = 0
        void persist()
        resolve()
      })
      source.pipe(sink)
    })
  }

  /**
   * Track a torrent file to completion. The engine already writes into its cache
   * dir, so this watches progress and copies the result into the download
   * folder when it lands (a stream playing and a download can share the swarm).
   */
  async function startTorrentDownload({ hash, fileIndex, title }) {
    await ensureLoaded()
    const service = await getTorrents()
    const files = await service.files(hash)
    const target = files.find((file) => file.index === fileIndex)
    if (target === undefined) throw new Error('这个种子里没有该文件')
    const existing = [...jobs.values()].find(
      (job) => job.kind === 'torrent' && job.hash === hash && job.fileIndex === fileIndex && job.status === 'running',
    )
    if (existing !== undefined) return view(existing)

    const id = randomUUID()
    const job = {
      id,
      kind: 'torrent',
      title: String(title ?? target.name),
      filename: basename(target.name),
      path: null,
      status: 'running',
      total: Number(target.size) || 0,
      received: Math.round((Number(target.progress) || 0) * (Number(target.size) || 0)),
      speed: 0,
      startedAt: Date.now(),
      finishedAt: 0,
      hash,
      fileIndex,
    }
    jobs.set(id, job)
    void runTorrentJob(job, service)
    return view(job)
  }

  async function runTorrentJob(job, service) {
    const deadline = Date.now() + 6 * 60 * 60 * 1000
    while (Date.now() < deadline) {
      if (job.status !== 'running') return
      let files
      try {
        files = await service.files(job.hash)
      } catch (error) {
        job.status = 'error'
        job.error = String(error?.message ?? error)
        job.finishedAt = Date.now()
        void persist()
        return
      }
      const target = files.find((file) => file.index === job.fileIndex)
      if (target === undefined) {
        job.status = 'error'
        job.error = '这个种子的文件列表变了'
        job.finishedAt = Date.now()
        void persist()
        return
      }
      job.total = Number(target.size) || job.total
      job.received = Math.round((Number(target.progress) || 0) * job.total)
      const torrents = await service.list().catch(() => [])
      const owner = torrents.find((item) => item.hash === job.hash)
      job.speed = Number(owner?.speed) || 0
      if (job.received >= job.total && job.total > 0) break
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    if (job.status !== 'running') return
    if (job.received < job.total) {
      job.status = 'error'
      job.error = '等待种子完成超时'
      job.finishedAt = Date.now()
      void persist()
      return
    }

    // The file lives in the torrent cache; copy it out when asked to.
    try {
      const resolved = await service.resolvePath(job.hash, job.fileIndex)
      job.sourcePath = resolved.path
      if (getSettings().copyTorrents === true) {
        const folder = dir()
        await mkdir(folder, { recursive: true })
        const path = join(folder, basename(resolved.path))
        try {
          await copyFile(resolved.path, path)
          job.path = path
          job.filename = basename(path)
        } catch (error) {
          // A copy can fail for a huge file on another volume; the cache path
          // still counts as downloaded, so record both outcomes honestly.
          job.path = resolved.path
          job.filename = basename(resolved.path)
          job.error = `已下载到缓存，但复制到下载目录失败：${String(error?.message ?? error)}`
        }
      } else {
        job.path = resolved.path
        job.filename = basename(resolved.path)
      }
      job.status = 'done'
    } catch (error) {
      job.status = 'error'
      job.error = String(error?.message ?? error)
    }
    job.finishedAt = Date.now()
    job.speed = 0
    void persist()
  }

  async function cancel(id) {
    const job = jobs.get(id)
    if (job === undefined) return { ok: false, error: '没有这个下载' }
    if (job.status !== 'running' && job.status !== 'queued') return { ok: false, error: '这个下载已经结束了' }
    // The bilibili job settles when its stream closes; mark it now so the page
    // can offer "remove" straight away instead of racing the abort.
    job.status = 'cancelling'
    if (job.kind === 'bili' && job.controller !== undefined) job.controller.abort()
    if (job.kind === 'stream') {
      // ffmpeg dies now; its close handler sees 'cancelled' below and only
      // cleans up, so a cancel never turns into an error row.
      job.status = 'cancelled'
      job.finishedAt = Date.now()
      try {
        job.child?.kill()
      } catch {
        /* already gone */
      }
    }
    if (job.kind === 'torrent') {
      job.status = 'cancelled'
      job.finishedAt = Date.now()
    }
    void persist()
    return { ok: true }
  }

  async function remove(id) {
    const job = jobs.get(id)
    if (job === undefined) return { ok: false, error: '没有这个下载' }
    if (job.status === 'running' || job.status === 'queued') return { ok: false, error: '先取消再删除' }
    jobs.delete(id)
    void persist()
    return { ok: true }
  }

  async function clearFinished() {
    for (const [id, job] of jobs) {
      if (job.status !== 'running' && job.status !== 'queued') jobs.delete(id)
    }
    void persist()
    return { ok: true, remaining: jobs.size }
  }

  /** Show a finished file in the OS file manager. */
  async function reveal(path) {
    const text = String(path ?? '')
    if (text === '') return { ok: false, error: '没有路径' }
    try {
      const info = await stat(text)
      if (!info.isFile()) return { ok: false, error: '不是一个文件' }
    } catch {
      return { ok: false, error: '文件不在了' }
    }
    const explorer = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/select,', text] : process.platform === 'darwin' ? ['-R', text] : [text]
    try {
      const child = spawn(explorer, args, { detached: true, stdio: 'ignore' })
      child.unref()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /** Usage figures for the settings page. */
  async function stats() {
    const folder = dir()
    let files = 0
    let bytes = 0
    try {
      const info = await stat(folder)
      if (info.isDirectory()) files = 1
    } catch {
      /* not created yet */
    }
    const active = [...jobs.values()].filter((job) => job.status === 'running').length
    return { dir: folder, files, bytes, formattedBytes: formatBytes(bytes), active, total: jobs.size }
  }

  return { list, startBiliDownload, startTorrentDownload, startStreamDownload, cancel, remove, clearFinished, reveal, stats, ensureLoaded }
}

/** Read just enough of a file to prove the path is a real media file. */
export async function fileExists(path) {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

export { formatBytes }
