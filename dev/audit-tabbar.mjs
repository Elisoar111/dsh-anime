import { readFileSync } from 'node:fs'

const source = readFileSync('client.js', 'utf8')
const needle = "tab === 'sources'"
const at = source.indexOf(needle)
console.log('offset', at)
console.log(source.slice(Math.max(0, at - 900), at + 1100))
