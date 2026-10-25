/**
 * Check the vendored AnimeFlow rules with the loose selector, so we can see
 * which sources our engine can actually drive today.
 *
 *   node dev/test-sources.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseHtml } from '../lib/html.js'
import { selectXPathLoose, textXPathLoose, attrXPathLoose } from '../lib/xpath.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const KEYWORD = process.argv[2] ?? '柯南'

const dir = join(import.meta.dirname, '..', 'assets', 'sources', 'animeflow')
const rules = readdirSync(dir)
  .filter((file) => file.endsWith('.json') && file !== 'index.json')
  .map((file) => ({ file, plugin: JSON.parse(readFileSync(join(dir, file), 'utf8')) }))
  .filter((entry) => String(entry.plugin.api) === '1')

let ok = 0
for (const { file, plugin } of rules) {
  const url = String(plugin.searchUrl).replace('{keyword}', encodeURIComponent(KEYWORD))
  const started = Date.now()
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, referer: plugin.baseUrl, 'accept-language': 'zh-CN,zh;q=0.9' },
    })
    const html = await response.text()
    const page = parseHtml(html)
    const items = selectXPathLoose([page], plugin.searchList)
    const first = items[0]
    const name = first === undefined ? '' : textXPathLoose([first], plugin.searchName)
    const href = first === undefined ? null : attrXPathLoose([first], plugin.searchLink, 'href')
    const good = items.length > 0 && String(name).trim() !== ''
    if (good) ok += 1
    console.log(
      `${good ? 'ok  ' : 'MISS'} ${file.padEnd(14)} ${String(response.status)} items=${String(items.length).padStart(3)} ${String(name).slice(0, 24).padEnd(26)} ${String(href).slice(0, 40)} (${Date.now() - started}ms)`,
    )
  } catch (error) {
    console.log(`ERR  ${file.padEnd(14)} ${error?.message ?? error}`)
  }
}

console.log(`\n${ok}/${rules.length} api-1 sources searchable`)
