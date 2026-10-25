import { readFileSync } from 'node:fs'

for (const file of ['lib/settings.js', 'lib/downloads.js']) {
  const source = readFileSync(file, 'utf8')
  console.log(`\n===== ${file} (${source.length} bytes) =====`)
  for (const line of source.split('\n')) {
    if (/^export |^const DEFAULT|^function |^async function |^  [a-zA-Z]+\(/.test(line)) console.log(line.trim())
  }
}
