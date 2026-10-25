import { readFileSync } from 'node:fs'

const index = readFileSync('index.js', 'utf8')
const markers = ['settings', 'downloads', 'download/', 'open-player', 'detectPlayers']

console.log('--- index.js size:', index.length)
for (const marker of markers) {
  const count = index.split(marker).length - 1
  console.log(`${marker}: ${count}`)
}

const routePattern = /'([a-z-]+\/[a-z/-]+)'/g
const routes = new Set()
let match
while ((match = routePattern.exec(index)) !== null) routes.add(match[1])
console.log('\n--- route-ish strings ---')
console.log([...routes].sort().join('\n'))
