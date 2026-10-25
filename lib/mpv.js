/**
 * Embedded mpv.
 *
 * The panel lives in an Electron renderer, so it cannot host libmpv itself.
 * What it can do is tell the Host where its player box is on screen, and the
 * Host can then start mpv as a child window of that Electron window
 * (`--wid=<hwnd> --geometry=<w>x<h>+<x>+<y>`): the video is drawn by mpv
 * inside the panel's own rectangle, exactly like seanime embeds mpv instead of
 * decoding in the browser.
 *
 * Everything the panel needs afterwards goes over mpv's JSON IPC socket
 * (`--input-ipc-server`), so play/pause, seeking, speed, volume and position
 * are real mpv state rather than a `<video>` approximation.
 */
import { spawn, execFile } from 'node:child_process'
import { connect } from 'node:net'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { ANIME4K_PRESETS, SHADER_DIR } from './torrent-engine.js'
import { statSync, readdirSync } from 'node:fs'

const execFileAsync = promisify(execFile)

/** `\\.\pipe\dsh-anime-mpv-<pid>` — one pipe per Host process. */
export const IPC_PATH = `\\\\.\\pipe\\dsh-anime-mpv-${process.pid}`

let current = null // { child, startedAt, url, title }
let socket = null
let pending = new Map()
let nextId = 1
let buffer = ''

async function findAppWindow(pid) {
  // MainWindowHandle is the Electron window mpv should parent itself under.
  const script = `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; if ($p) { $p.MainWindowHandle }`
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 5000,
    windowsHide: true,
  })
  const handle = Number(String(stdout).trim())
  return Number.isFinite(handle) && handle > 0 ? handle : 0
}

function connectIpc() {
  return new Promise((resolve, reject) => {
    const client = connect(IPC_PATH)
    client.setEncoding('utf8')
    client.once('connect', () => resolve(client))
    client.once('error', reject)
  })
}

function handleLine(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (typeof message?.request_id !== 'number') return
  const waiter = pending.get(message.request_id)
  if (waiter === undefined) return
  pending.delete(message.request_id)
  if (message.error === 'success') waiter.resolve(message.data)
  else waiter.reject(new Error(String(message.error ?? 'mpv ipc error')))
}

function command(...args) {
  if (socket === null) return Promise.reject(new Error('mpv 未在运行'))
  const id = nextId++
  const payload = `${JSON.stringify({ command: args, request_id: id })}\n`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.write(payload, (error) => {
      if (error !== null && error !== undefined) {
        pending.delete(id)
        reject(error)
      }
    })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('mpv 没有回应'))
      }
    }, 4000).unref?.()
  })
}

/** What the shader picker shows: the folder, the files in it, the presets. */
export function shaderCatalogue() {
  let files = []
  try {
    files = readdirSync(SHADER_DIR).filter((name) => name.endsWith('.glsl')).sort()
  } catch {
    files = []
  }
  return {
    dir: SHADER_DIR,
    files,
    count: files.length,
    presets: Object.keys(ANIME4K_PRESETS).map((key) => ({ key, files: (ANIME4K_PRESETS[key] ?? []).length })),
  }
}

function shaderArgs(preset) {
  const names = ANIME4K_PRESETS[preset] ?? []
  const out = []
  for (const name of names) {
    const file = join(SHADER_DIR, `Anime4K_${name}.glsl`)
    try {
      statSync(file)
      out.push(`--glsl-shaders-append=${file}`)
    } catch {
      /* pack is optional */
    }
  }
  return out
}

/** Keep the overlay glued to the panel rectangle while it plays. */
export async function repin(rect, origin = null) {
  if (current === null || socket === null) return { ok: false, error: 'mpv 未在运行' }
  const box = screenRect(rect, origin ?? { x: 0, y: 0, dpr: 1 })
  await command('set_property', 'geometry', `${box.width}x${box.height}+${box.x}+${box.y}`)
  return { ok: true, geometry: `${box.width}x${box.height}+${box.x}+${box.y}` }
}

/** Start mpv inside `rect` (screen pixels) with the given stream. */
/** Screen rectangle for the panel's stage, in physical pixels. */
function screenRect(rect, origin) {
  const dpr = Number(origin?.dpr) > 0 ? Number(origin.dpr) : 1
  const left = Number(rect?.left ?? rect?.x ?? 0)
  const top = Number(rect?.top ?? rect?.y ?? 0)
  const width = Number(rect?.width) || 640
  const height = Number(rect?.height) || 360
  return {
    x: Math.max(0, Math.round((Number(origin?.x) || 0) * dpr + left * dpr)),
    y: Math.max(0, Math.round((Number(origin?.y) || 0) * dpr + top * dpr)),
    width: Math.max(160, Math.round(width * dpr)),
    height: Math.max(90, Math.round(height * dpr)),
  }
}

export async function embed({ url, audioUrl = '', headers = null, rect, origin = null, start = 0, title = '', anime4k = 'off', deband = false, speed = 1 } = {}) {
  if (typeof url !== 'string' || url === '') throw new Error('缺少播放地址')
  await close()
  // Two ways to put mpv over the panel:
  //  - `--wid` (seanime's trick): mpv draws as a child of the app window. In an
  //    Electron app the webview is composited (DirectComposition), so that child
  //    window ends up *behind* the page: the rectangle stays black.
  //  - overlay: a borderless always-on-top mpv window parked exactly on the
  //    stage rectangle. No compositing involved, so the picture is visible.
  // The page knows where its window is on screen (window.screenX + devicePixelRatio),
  // so prefer the overlay and keep --wid only when that is asked for explicitly.
  const overlay = origin !== null && Number(origin?.x) !== undefined && process.env.DSH_ANIME_EMBED_WID !== '1'
  const targetPid = Number(process.env.DSH_ANIME_WINDOW_PID) || process.pid
  const handle = overlay ? 0 : await findAppWindow(targetPid)
  const box = overlay ? screenRect(rect, origin) : screenRect(rect, { x: 0, y: 0, dpr: 1 })
  const { width, height, x, y } = box
  const args = [
    url,
    '--no-terminal',
    '--force-window=yes',
    '--keep-open=no',
    '--input-ipc-server=' + IPC_PATH,
    `--geometry=${width}x${height}+${x}+${y}`,
  ]
  // mpv does its own http fetching, so the Referer bilibili wants has to be
  // handed to it rather than added by our proxy.
  if (headers !== null && typeof headers === 'object') {
    const lines = Object.entries(headers)
      .filter(([, value]) => typeof value === 'string' && value !== '')
      .map(([key, value]) => `${key}: ${value}`)
    if (lines.length > 0) args.push(`--http-header-fields=${lines.join(',')}`)
  }
  // DASH gives video and audio as two separate tracks; mpv merges them itself.
  if (typeof audioUrl === 'string' && audioUrl !== '') args.push(`--audio-file=${audioUrl}`)
  if (overlay) args.push('--no-border', '--ontop-level=floating', '--ontop', '--no-focus-on-open')
  if (handle > 0) args.push(`--wid=${handle}`)
  if (start > 0) args.push(`--start=${Math.floor(start)}`)
  if (title !== '') args.push(`--title=${title}`)
  if (speed !== 1) args.push(`--speed=${speed}`)
  args.push(...shaderArgs(anime4k))
  if (deband === true) args.push('--deband=yes', '--deband-iterations=2', '--deband-threshold=48', '--deband-range=20')
  const child = spawn('mpv', args, { detached: false, stdio: 'ignore', windowsHide: false })
  current = { child, startedAt: Date.now(), url, title, embedded: overlay || handle > 0, overlay }
  // The pipe appears a beat after the process; a few short tries beat one long sleep.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      socket = await connectIpc()
      buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk
        let index = buffer.indexOf('\n')
        while (index >= 0) {
          handleLine(buffer.slice(0, index))
          buffer = buffer.slice(index + 1)
          index = buffer.indexOf('\n')
        }
      })
      socket.on('error', () => {
        socket = null
      })
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }
  child.once('exit', () => {
    current = null
    try {
      socket?.end()
    } catch {
      /* closed */
    }
    socket = null
  })
  return { embedded: overlay || handle > 0, overlay, pipe: IPC_PATH, pid: child.pid, geometry: `${width}x${height}+${x}+${y}` }
}

export async function status() {
  if (current === null) return { running: false }
  const read = async (name) => {
    try {
      return await command('get_property', name)
    } catch {
      return null
    }
  }
  const [position, duration, paused, volume, speed, pathName] = await Promise.all([
    read('time-pos'),
    read('duration'),
    read('pause'),
    read('volume'),
    read('speed'),
    read('filename'),
  ])
  return {
    running: true,
    embedded: current.embedded,
    pid: current.child.pid,
    title: current.title,
    file: pathName,
    position: Number(position) || 0,
    duration: Number(duration) || 0,
    paused: paused === true,
    volume: Number(volume) || 0,
    speed: Number(speed) || 1,
  }
}

/** One control surface for the panel's buttons. */
export async function control(action, value) {
  if (current === null) throw new Error('内嵌 mpv 没在运行')
  switch (String(action)) {
    case 'toggle':
      await command('cycle', 'pause')
      return status()
    case 'pause':
      await command('set_property', 'pause', true)
      return status()
    case 'play':
      await command('set_property', 'pause', false)
      return status()
    case 'seek':
      await command('seek', Number(value) || 0, 'absolute')
      return status()
    case 'relative':
      await command('seek', Number(value) || 0, 'relative')
      return status()
    case 'speed':
      await command('set_property', 'speed', Math.max(0.25, Math.min(4, Number(value) || 1)))
      return status()
    case 'volume':
      await command('set_property', 'volume', Math.max(0, Math.min(200, Number(value) || 0)))
      return status()
    case 'shaders': {
      const [file] = shaderArgs(String(value ?? 'off'))
      await command('set_property', 'glsl-shaders', file ?? '')
      return status()
    }
    default:
      throw new Error(`未知的播放器动作 ${action}`)
  }
}

export async function close() {
  const running = current
  current = null
  if (running !== null) {
    try {
      await command('quit')
    } catch {
      /* already gone */
    }
    try {
      running.child.kill()
    } catch {
      /* already gone */
    }
  }
  try {
    socket?.end()
  } catch {
    /* closed */
  }
  socket = null
  pending = new Map()
  return { running: false }
}
