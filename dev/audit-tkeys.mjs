// Every dictionary literal in client.js, so the audit follows the code: the
// sheet both declares `const ZH = {...}` / `en: {...}` and later patches them
// with `Object.assign(ZH, {...})`. Reading only the first literal reported 45
// keys as missing that the assign blocks had already filled in.
import { readFileSync } from 'node:fs'

const src = readFileSync('client.js', 'utf8')

function literalAt(index) {
  const open = src.indexOf('{', index)
  if (open === -1) return null
  let depth = 0
  let quote = ''
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i]
    if (quote !== '') {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return new Function(`return ${src.slice(open, i + 1)}`)()
    }
  }
  return null
}

function collect(patterns) {
  const merged = {}
  for (const pattern of patterns) {
    for (const match of src.matchAll(pattern)) {
      Object.assign(merged, literalAt(match.index) ?? {})
    }
  }
  return merged
}

// The settings / downloads sections keep their copy in their own literals
// (SECTIONS_KEYS_ZH / SETTINGS_KEYS_ZH …) and merge them with Object.assign at
// runtime, so the audit has to fold every *_KEYS_ZH / *_KEYS_EN literal in too.
const zh = collect([
  /const ZH = \{/g,
  /Object\.assign\(ZH, \{/g,
  /const [A-Z0-9_]*KEYS_ZH = \{/g,
])
const en = collect([
  /const EN = \{/g,
  /\bEN = \{/g,
  /Object\.assign\(EN, \{/g,
  /const [A-Z0-9_]*KEYS_EN = \{/g,
])

const used = new Set([...src.matchAll(/\bT\('([A-Za-z0-9]+)'\)/g)].map((m) => m[1]))
const missing = (dict) => [...used].filter((key) => dict[key] === undefined)

const missingZh = missing(zh)
const missingEn = missing(en)
console.log('ZH keys', Object.keys(zh).length, '| EN keys', Object.keys(en).length, '| used', used.size)
console.log('missing ZH:', missingZh.join(', ') || '(none)')
console.log('missing EN:', missingEn.join(', ') || '(none)')
const hollow = [...used].filter((key) => {
  const value = zh[key]
  return typeof value === 'string' && value.trim() === ''
})
if (hollow.length > 0) console.log('empty ZH values:', hollow.join(', '))
process.exitCode = missingZh.length + missingEn.length + hollow.length > 0 ? 1 : 0
