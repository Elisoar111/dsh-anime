/**
 * Unit tests for lib/html.js (the jsoup-shaped parser the scrapers use).
 *
 *   node dev/test-html.mjs
 *
 * Last section hits the real site when the network allows it; those checks are
 * skipped (not failed) when the fetch throws, so this file is safe to run in a
 * sandbox without internet.
 */

import { parseHtml, selectHtml, decodeEntities } from '../lib/html.js'

let passed = 0
let failed = 0

function check(label, actual, expected) {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left === right) {
    passed += 1
    console.log(`PASS  ${label}`)
  } else {
    failed += 1
    console.log(`FAIL  ${label}\n      got      ${left}\n      expected ${right}`)
  }
}

/* ------------------------------------------------------------------ structure */

{
  const doc = parseHtml('<div class="a"><p>one</p><p>two <b>bold</b></p></div>')
  check('two <p> found', doc.select('p').length, 2)
  check('text collapses', doc.selectOne('div').text(), 'one two bold')
  check('inner html kept', doc.selectOne('div').html(), '<p>one</p><p>two <b>bold</b></p>')
}

{
  const doc = parseHtml('<ul><li>a<li>b<li>c</ul>')
  check('unclosed <li> repaired', doc.select('li').length, 3)
  check('list texts', doc.select('li').map((el) => el.text()), ['a', 'b', 'c'])
}

{
  const doc = parseHtml('<p>x</span>y</p>')
  check('stray end tag ignored', doc.selectOne('p').text(), 'xy')
}

{
  const doc = parseHtml('<div><img src="a.png"><br><span>z</span></div>')
  check('void tags are not containers', doc.select('div span').length, 1)
  check('img attribute', doc.selectOne('img').attr('src'), 'a.png')
  check('void tag text is space', doc.selectOne('div').text(), 'z')
}

{
  const doc = parseHtml('<script>var a = "<div>"; if (1 < 2) {}</script><p>after</p>')
  check('script content is raw', doc.selectOne('script').text().includes('<div>'), true)
  check('text after script', doc.selectOne('p').text(), 'after')
}

{
  const doc = parseHtml('<!-- comment --><p>a</p><!-- c2 -->')
  check('comments dropped', doc.text(), 'a')
}

/* ----------------------------------------------------------------- attributes */

{
  const doc = parseHtml(`
    <a href="/index.php/vod/detail/id/12177.html">咒术回战</a>
    <a href="/index.php/vod/detail/id/9.html"><span>另一部</span></a>
    <a href="https://example.com/x">外链</a>
  `)
  check('substring href selector', doc.select('a[href*="/vod/detail/id/"]').length, 2)
  check('nested text', doc.selectOne('a[href*="/vod/detail/id/9"]').text(), '另一部')
  check('quoted = selector', doc.select('a[href="https://example.com/x"]').length, 1)
  check('prefix selector', doc.select('a[href^="https"]').length, 1)
  check('suffix selector', doc.select('a[href$=".html"]').length, 2)
}

{
  const doc = parseHtml('<div id="main" class="wrap big"><span class="t">x</span></div>')
  check('#id', doc.select('#main').length, 1)
  check('.class', doc.select('.t').length, 1)
  check('tag.class', doc.select('span.t').length, 1)
  check('descendant chain', doc.select('#main .t').length, 1)
  check('wrong chain', doc.select('#nope .t').length, 0)
  check('multi class', doc.select('.wrap.big').length, 1)
}

{
  const doc = parseHtml('<div><p class="a">1</p><p class="b">2</p></div>')
  check('comma list', doc.select('p.a, p.b').length, 2)
  check('universal', doc.select('*').length, 3)
}

/* -------------------------------------------------------------------- entities */

check('named entities', decodeEntities('a&amp;b&nbsp;c'), 'a&b\u00a0c')
check('numeric entities', decodeEntities('&#65;&#x42;'), 'AB')
check('unknown entity kept', decodeEntities('&nope;'), '&nope;')
check('entity in attribute', parseHtml('<a title="a&amp;b">x</a>').selectOne('a').attr('title'), 'a&b')

/* ------------------------------------------------------------------ real site */

const site = 'https://www.fqdm.cc'

async function tryLive() {
  try {
    const response = await fetch(`${site}/index.php/vod/search.html?wd=${encodeURIComponent('咒术回战')}`, {
      headers: { referer: `${site}/`, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
    })
    if (response.ok !== true) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const doc = parseHtml(html)
    const anchors = doc.select('a[href*="/vod/detail/id/"]')
    check('live: search page parsed', anchors.length > 0, true)
    // Same extraction the scraper does: id out of the href, title out of the text.
    const rows = anchors
      .map((anchor) => ({
        id: /\/vod\/detail\/id\/(\d+)\.html/.exec(anchor.attr('href') ?? '')?.[1] ?? '',
        title: anchor.text(),
      }))
      .filter((row) => row.id !== '' && row.title !== '')
    check('live: every anchor yields id + title', rows.length === anchors.length, true)
    console.log(`      live search anchors: ${rows.length}, first: ${rows[0]?.id} ${rows[0]?.title.slice(0, 16)}`)
  } catch (error) {
    console.log(`SKIP  live search page (${error.message})`)
  }

  try {
    const response = await fetch(`${site}/index.php/vod/detail/id/12177.html`, {
      headers: { referer: `${site}/`, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
    })
    if (response.ok !== true) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()
    const doc = parseHtml(html)
    const plays = doc.select('a[href*="/play/id/"]')
    check('live: detail page has play links', plays.length > 0, true)
    console.log(`      live play links: ${plays.length}`)
  } catch (error) {
    console.log(`SKIP  live detail page (${error.message})`)
  }
}

await tryLive()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
