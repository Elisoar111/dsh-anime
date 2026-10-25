import { readFileSync } from 'node:fs'

const source = readFileSync('client.js', 'utf8')
for (const needle of ['Object.assign(ZH', 'Object.assign(EN', '${PLAYER_CSS}', '${SETTINGS_CSS}', 'const SETTINGS_CSS', 'const PLAYER_CSS', 'function Player(', 'function SourcesTab']) {
  const at = source.indexOf(needle)
  console.log(`${needle}: ${at}${at < 0 ? '  <-- MISSING' : ''}`)
}
const at = source.indexOf('Object.assign(ZH')
console.log('\n--- around ZH merge ---')
console.log(source.slice(at - 200, at + 300))
