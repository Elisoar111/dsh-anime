import { readFileSync } from 'node:fs'

const source = readFileSync('lib/torrent-engine.js', 'utf8')
console.log('size', source.length)
for (const line of source.split('\n')) {
  if (/^export /.test(line)) console.log(line.trim())
}
const at = source.indexOf('export function createTorrentService')
console.log('\n--- createTorrentService ---')
console.log(source.slice(at, at + 1200))
const at2 = source.indexOf('function detectPlayers')
console.log('\n--- detectPlayers ---')
console.log(source.slice(at2, at2 + 500))
