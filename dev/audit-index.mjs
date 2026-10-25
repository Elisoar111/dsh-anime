import { readFileSync } from 'node:fs'

const source = readFileSync('index.js', 'utf8')
const lines = source.split('\n')

function show(label, needle) {
  const at = source.indexOf(needle)
  console.log(`\n===== ${label} (offset ${at}) =====`)
  if (at < 0) return
  console.log(source.slice(Math.max(0, at - 200), at + 1200))
}

show('imports', "from './lib/torrent-engine.js'")
show('apply start', 'export function apply(ctx)')
show('get handlers map', 'const handlers = {')
show('postHandlers', 'const postHandlers')
show('webServer.register', 'webServer.register')
show('torrentService', 'torrentService')
console.log('\n--- total lines:', lines.length)
