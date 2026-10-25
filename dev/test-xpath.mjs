/**
 * XPath-lite unit tests, then the same engine against real search pages of the
 * vendored source rules. The live part is what actually matters: the rules were
 * written for another client, so this is where "does our subset understand
 * them" gets answered.
 *
 *   node dev/test-xpath.mjs            # unit tests only
 *   node dev/test-xpath.mjs --live     # also hit the real sites
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseHtml } from '../lib/html.js'
import { selectXPath, textXPath, attrXPath } from '../lib/xpath.js'

let failed = 0

function check(label, ok, detail) {
  if (ok) {
    console.log(`ok   ${label}${detail === undefined ? '' : ` → ${detail}`}`)
    return
  }
  failed += 1
  console.log(`FAIL ${label}${detail === undefined ? '' : ` → ${detail}`}`)
}

const doc = parseHtml(`
<html><body>
  <div id="list">
    <div class="card"><h3><a href="/a/1">第一</a></h3><span>第1集</span></div>
    <div class="card"><h3><a href="/a/2">第二</a></h3><span>第2集</span></div>
  </div>
  <div class="nav"><button>线路一</button><button>线路二</button></div>
  <ul class="eps"><li><a href="/p/1">1</a></li><li><a href="/p/2">2</a></li></ul>
</body></html>
`)

check(
  'absolute id selector',
  selectXPath([doc], "//div[@id='list']").length === 1,
)
check(
  'class selector',
  selectXPath([doc], "//div[@class='card']").length === 2,
)
check(
  'descendant chain into text',
  textXPath([doc], "//div[@id='list'] /div[1] /h3 /a") === '第一',
  textXPath([doc], "//div[@id='list'] /div[1] /h3 /a"),
)
check(
  'positional predicate is per parent',
  attrXPath([doc], "//div[@id='list'] /div[2] /h3 /a", 'href') === '/a/2',
  attrXPath([doc], "//div[@id='list'] /div[2] /h3 /a", 'href'),
)
check(
  'text() tail is accepted',
  textXPath([doc], "//div[@class='nav'] /button[2] /text()") === '线路二',
  textXPath([doc], "//div[@class='nav'] /button[2] /text()"),
)
check(
  'wildcard descendant',
  selectXPath([doc], '//*').length > 5,
)
check(
  'relative path from one node',
  (() => {
    const card = selectXPath([doc], "//div[@class='card']")[1]
    return textXPath([card], '/h3 /a') === '第二'
  })(),
)

const LIVE = process.argv.includes('--live')
if (LIVE) {
  const dir = join(import.meta.dirname, '..', 'assets', 'sources', 'animeflow')
  const rules = readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'index.json')
    .map((file) => ({ file, plugin: JSON.parse(readFileSync(join(dir, file), 'utf8')) }))
    .filter((entry) => String(entry.plugin.api) === '1')

  for (const { file, plugin } of rules) {
    const url = String(plugin.searchUrl).replace('{keyword}', encodeURIComponent('柯南'))
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          referer: plugin.baseUrl,
        },
      })
      const html = await response.text()
      const page = parseHtml(html)
      const items = selectXPath([page], plugin.searchList)
      const first = items[0]
      const name = first === undefined ? '' : textXPath([first], plugin.searchName)
      const href = first === undefined ? null : attrXPath([first], plugin.searchLink, 'href')
      check(
        `${file} search`,
        items.length > 0 && String(name).trim() !== '',
        `${response.status} items=${items.length} name=${JSON.stringify(name).slice(0, 40)} href=${String(href).slice(0, 48)}`,
      )
    } catch (error) {
      failed += 1
      console.log(`FAIL ${file} search → ${error?.message ?? error}`)
    }
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall xpath checks passed')
}
