import { readFileSync } from 'node:fs'
const source = readFileSync('client.js', 'utf8')
const startMarker = 'const CSS = `'
const start = source.indexOf(startMarker)
const end = source.indexOf('`\n\n    function ensureStyles')
const css = source.slice(start + startMarker.length, end)
const opens = (css.match(/\{/g) || []).length
const closes = (css.match(/\}/g) || []).length
let depth = 0
let firstNegative = -1
for (let index = 0; index < css.length; index += 1) {
  if (css[index] === '{') depth += 1
  else if (css[index] === '}') {
    depth -= 1
    if (depth < 0 && firstNegative === -1) firstNegative = index
  }
}
console.log({ bytes: css.length, backticks: (css.match(/`/g) || []).length, opens, closes, finalDepth: depth, firstNegative })
console.log('grid:', css.includes('.dshan-grid{'), 'detail:', css.includes('.dshan-detail{'), 'card:', css.includes('.dshan-card{'))
console.log('tail:', JSON.stringify(css.slice(-90)))
// Where does the CSS end relative to the @media rule?
const media = css.lastIndexOf('@media')
console.log('last @media at', media, 'of', css.length)
