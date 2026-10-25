import { searchAniBT } from '../lib/anibt.js'

const cases = [
  { query: 'Kusuriya no Hitorigoto 3rd Season', bangumiTitles: ['薬屋のひとりごと', '药屋少女的呢喃'], episode: 1 },
  { query: '葬送的芙莉莲', bangumiTitles: [], episode: 1 },
]

for (const input of cases) {
  const started = Date.now()
  const result = await searchAniBT({ ...input, resolution: '', batch: '', limit: 8 })
  const elapsed = Date.now() - started
  console.log(`\n=== ${input.query}  ${elapsed}ms  subjects=${result.subjects.length} scanned=${result.scanned} matched=${result.matched}`)
  for (const item of result.items.slice(0, 5)) {
    console.log(`  ${item.formattedSize.padStart(9)}  ep${item.episodeNumber}${item.isBatch ? '(batch)' : ''}  ${item.resolution || '   -  '}  ${item.title.slice(0, 78)}`)
  }
  if (result.items.length === 0) console.log('  (no releases)')
}

// Second call must be served from the cache and return immediately.
const warm = Date.now()
await searchAniBT({ query: '葬送的芙莉莲', bangumiTitles: [], episode: 1, resolution: '', batch: '', limit: 8 })
console.log(`\ncached repeat: ${Date.now() - warm}ms`)
