/** Debug one rule against one page. node dev/probe-rule.mjs <rule.json> <url> */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseHtml } from '../lib/html.js'
import { selectXPathLoose, selectXPath, textXPathLoose, attrXPathLoose } from '../lib/xpath.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const rule = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'assets', 'sources', 'animeflow', process.argv[2]), 'utf8'))
const url = process.argv[3]
const page = parseHtml(await (await fetch(url, { headers: { 'user-agent': UA, referer: rule.baseUrl } })).text())

for (const key of ['searchList', 'searchName', 'lineNames', 'lineList', 'episode']) {
  const expression = rule[key]
  if (String(expression ?? '') === '') continue
  let strict = 0
  try {
    strict = selectXPath([page], expression).length
  } catch (error) {
    strict = -1
  }
  const loose = selectXPathLoose([page], expression)
  const sample = loose.slice(0, 3).map((node) => `${node.tag}.${node.className}`.slice(0, 60))
  console.log(`${key.padEnd(11)} strict=${String(strict).padStart(3)} loose=${String(loose.length).padStart(3)} ${JSON.stringify(expression)}`)
  if (sample.length > 0) console.log(`            ${JSON.stringify(sample)}`)
}
