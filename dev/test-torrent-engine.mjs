// Does metadata arrive, and how fast, through the real engine module?
import { createTorrentService } from '../lib/torrent-engine.js'
import { searchAnimeTosho } from '../lib/animetosho.js'

const found = await searchAnimeTosho({ query: 'Sousou no Frieren', episode: 1, resolution: '1080p' })
const single = found.items.find((item) => !item.isBatch && item.episodeNumber === 1)
console.log('target:', single.title.slice(0, 70), '| seeders', single.seeders, '|', single.formattedSize)

const service = await createTorrentService()
const hash = await service.add(single.magnet)
console.log('hash:', hash)

const started = Date.now()
let last = null
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const list = await service.list()
  const item = list.items.find((entry) => entry.hash === hash)
  last = item
  if (attempt % 4 === 0) {
    console.log(
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
      'ready=', item?.ready, 'peers=', item?.peers, 'progress=', item?.progress?.toFixed?.(3), 'files=', item?.files?.length,
    )
  }
  if (item?.ready === true && (item.files?.length ?? 0) > 0) break
}

if (last?.ready !== true) {
  console.log('METADATA FAILED after', ((Date.now() - started) / 1000).toFixed(1), 's')
  console.log(JSON.stringify(last, null, 2).slice(0, 800))
} else {
  console.log('ready in', ((Date.now() - started) / 1000).toFixed(1), 's')
  console.log(JSON.stringify(last.files.slice(0, 3), null, 2))
  const file = last.files[0]
  const head = await service.head(hash, file.index)
  console.log('head:', head)
  const started2 = Date.now()
  const opened = await service.open(hash, file.index, { start: 0, end: Math.min(1048575, head.size - 1) })
  let bytes = 0
  await new Promise((resolve, reject) => {
    opened.stream.on('data', (chunk) => {
      bytes += chunk.length
    })
    opened.stream.on('end', resolve)
    opened.stream.on('error', reject)
    setTimeout(() => {
      opened.stream.destroy()
      resolve()
    }, 60000)
  })
  console.log('first chunk read:', bytes, 'bytes in', ((Date.now() - started2) / 1000).toFixed(1), 's')
}
await service.destroy?.()
process.exit(0)
