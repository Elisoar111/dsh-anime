// AniBT search -> engine add -> metadata -> first bytes, end to end.
import { searchAniBT } from '../lib/anibt.js'
import { createTorrentService } from '../lib/torrent-engine.js'

const query = process.argv[2] ?? '葬送的芙莉莲'
const episode = Number(process.argv[3] ?? 1)

const found = await searchAniBT({ query, episode, resolution: '1080p' })
console.log('subjects:', found.subjects.map((s) => `${s.bgmId}:${s.nameCn || s.name}`).join(' | '))
console.log('scanned releases:', found.scanned, 'matched:', found.matched, 'returned:', found.items.length)
for (const item of found.items.slice(0, 6)) {
  console.log(` - ${item.formattedSize.padEnd(9)} ${String(item.seeders).padStart(4)}p  ep${item.episodeNumber}${item.isBatch ? ' batch' : ''}  ${item.title.slice(0, 62)}`)
}
const chosen = found.items[0]
if (chosen === undefined) {
  console.log('NOTHING TO TEST')
  process.exit(0)
}

const service = await createTorrentService()
const hash = await service.add(chosen.magnet)
console.log('\nadding:', hash, '|', chosen.title.slice(0, 60))

const started = Date.now()
let item = null
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const list = await service.list()
  item = list.items.find((entry) => entry.hash === hash) ?? null
  if (attempt % 4 === 0) {
    console.log(`${((Date.now() - started) / 1000).toFixed(0)}s peers=${item?.peers} ready=${item?.ready} progress=${item?.progress?.toFixed?.(3)} files=${item?.files?.length}`)
  }
  if (item?.ready === true && (item.files?.length ?? 0) > 0) break
}

if (item?.ready !== true) {
  console.log('METADATA FAILED', ((Date.now() - started) / 1000).toFixed(0), 's; peers =', item?.peers)
  process.exit(0)
}

console.log('metadata in', ((Date.now() - started) / 1000).toFixed(1), 's | files', item.files.length, '| total', item.formattedSize)
const target = item.files.find((file) => /\.(mkv|mp4|avi)$/i.test(file.name)) ?? item.files[0]
console.log('file:', target.name.slice(0, 70), target.size)

const head = await service.head(hash, target.index)
console.log('head:', head.size, head.contentType)
const openStarted = Date.now()
const opened = await service.open(hash, target.index, { start: 0, end: Math.min(4 * 1024 * 1024 - 1, head.size - 1) })
let bytes = 0
await new Promise((resolve) => {
  const timer = setTimeout(() => {
    opened.stream.destroy()
    resolve()
  }, 90000)
  opened.stream.on('data', (chunk) => {
    bytes += chunk.length
  })
  opened.stream.on('end', () => {
    clearTimeout(timer)
    resolve()
  })
  opened.stream.on('error', () => {
    clearTimeout(timer)
    resolve()
  })
})
console.log('read', (bytes / 1048576).toFixed(2), 'MB in', ((Date.now() - openStarted) / 1000).toFixed(1), 's')
process.exit(0)
