/** Isolate the bili writer: does bytes reach the disk while the job runs? */
import { statSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDownloads } from '../lib/downloads.js'
import { DEFAULT_SETTINGS, coerceSettings, resolvePaths } from '../lib/settings.js'

const dir = mkdtempSync(join(tmpdir(), 'dshan-dl-'))
const settings = coerceSettings({ ...DEFAULT_SETTINGS, downloads: { ...DEFAULT_SETTINGS.downloads, dir } }, DEFAULT_SETTINGS)
// createDownloads() wants the resolved paths ({stateDir, downloadDir}), not the raw settings.
const paths = { ...resolvePaths(settings), downloadDir: dir }
const downloads = createDownloads({ getSettings: () => paths, getTorrents: () => null })

// A short clip keeps the test fast; the mechanism is identical to a full episode.
const url = 'https://api.bilibili.com/x/player/playurl?bvid=BV1GJ411x7h7&cid=137649199&qn=16&fnval=1&fnver=0&fourk=1'
const payload = await (await fetch(url, { headers: { referer: 'https://www.bilibili.com/', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } })).json()
const media = payload?.data?.durl?.[0]?.url
if (!media) throw new Error('no media url')

const job = await downloads.startBiliDownload({
  url: media,
  headers: {
    referer: 'https://www.bilibili.com/',
    origin: 'https://www.bilibili.com',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  title: 'dsh-anime writer probe',
  extension: '.mp4',
  total: payload?.data?.durl?.[0]?.size ?? 0,
})
console.log('job id', job.id, 'path', job.path)

for (let i = 0; i < 8; i += 1) {
  await new Promise((r) => setTimeout(r, 1000))
  const state = downloads.list().find((entry) => entry.id === job.id)
  const onDisk = existsSync(`${job.path}.part`) ? statSync(`${job.path}.part`).size : existsSync(job.path) ? statSync(job.path).size : -1
  console.log(`t=${i + 1}s status=${state?.status} received=${state?.received} speed=${state?.speed} disk=${onDisk}`)
}
