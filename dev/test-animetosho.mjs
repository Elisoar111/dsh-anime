import { searchAnimeTosho, parseAnimeToshoEntries } from '../lib/animetosho.js'

const first = await searchAnimeTosho({ query: 'Sousou no Frieren', episode: 3, resolution: '1080p' })
console.log(JSON.stringify(
  {
    url: first.url,
    scanned: first.scanned,
    total: first.total,
    items: first.items.slice(0, 5).map((item) => ({
      title: item.title.slice(0, 90),
      size: item.formattedSize,
      seeders: item.seeders,
      leechers: item.leechers,
      group: item.releaseGroup,
      ep: item.episodeNumber,
      res: item.resolution,
      batch: item.isBatch,
      hash: item.infoHash,
      files: item.fileCount,
      date: item.submittedAt,
      magnet: item.magnet.slice(0, 60),
    })),
  },
  null,
  2,
))

const batch = await searchAnimeTosho({ query: 'Sousou no Frieren', batch: 'only' })
console.log('batch-only count:', batch.total, 'first:', batch.items[0]?.title.slice(0, 80))

// A parser smoke test on a tiny synthetic page.
const synthetic = `<div class="home_list_datesep">01/02/2027</div><div class="home_list_entry home_list_entry_alt"><div class="date" title="Date/time submitted: 01/02/2027 10:00">10:00</div><div class="size" title="Total file size: 1,048,576 bytes">1.00 MB</div><div class="link"><a href="https://animetosho.org/view/x.n1">[Grp] Show - 03 (1080p) [ABCD]</a></div><div class="links"><span class="serieslink"><a href="https://animetosho.org/series/x">Show</a></span><a href="magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&amp;dn=x">Magnet</a> <span title="Seeders: 7 / Leechers: 2">[7&#8593;/2&#8595;]</span> <em>(1 files)</em></div></div>`
console.log('synthetic:', JSON.stringify(parseAnimeToshoEntries(synthetic), null, 2))
