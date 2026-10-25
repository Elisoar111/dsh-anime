// Fetches what fqdm resolves to and inspects the playlist: does the m3u8 load,
// does the first segment come back, and with which headers.
const resolveModule = await import('../lib/fqdm.js')
const { fqdmExtension } = resolveModule

const id = process.env.ONLINE_ID ?? '13607'
const line = process.env.ONLINE_LINE ?? '无尽③'

const servers = await fqdmExtension.servers(id)
console.log('servers', JSON.stringify(servers))
const lineInfo = servers.find((entry) => entry.name === line) ?? servers[0]
const episodes = await fqdmExtension.episodes(id, lineInfo.name)
console.log('episodes', episodes.length, episodes[0]?.id)
const resolved = await fqdmExtension.resolve(episodes[0].id, lineInfo.name)
console.log('resolve', JSON.stringify({ ...resolved, url: String(resolved.url).slice(0, 160) }))

const headers = resolved.headers ?? {}
const response = await fetch(resolved.url, { headers })
console.log('playlist', response.status, response.headers.get('content-type'))
const text = await response.text()
console.log('playlist bytes', text.length)
console.log(text.split('\n').slice(0, 12).join('\n'))

const segment = text
  .split('\n')
  .map((line) => line.trim())
  .find((line) => line !== '' && line.startsWith('#') === false)
if (segment === undefined) {
  console.log('no segment line')
  process.exit(0)
}
const base = new URL(resolved.url)
const segmentUrl = segment.startsWith('http') ? segment : new URL(segment, base).toString()
console.log('segment url', segmentUrl.slice(0, 160))
const seg = await fetch(segmentUrl, { headers })
console.log('segment', seg.status, seg.headers.get('content-type'), seg.headers.get('content-length'))
const buffer = Buffer.from(await seg.arrayBuffer())
console.log('segment bytes', buffer.length, 'head', JSON.stringify(buffer.subarray(0, 24).toString('latin1')))
