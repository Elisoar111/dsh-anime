/**
 * One-off: how does the fqdm search page structure a result card? Prints the
 * detail anchors with their text, their tag, and the text of their ancestors,
 * so the scraper can pick the title from the right node instead of guessing.
 *
 *   node dev/probe-fqdm-search-dom.mjs [关键词]
 */

import { parseHtml } from '../lib/html.js'

const site = 'https://www.fqdm.cc'
const term = process.argv[2] ?? '咒术回战'

const response = await fetch(`${site}/index.php/vod/search.html?wd=${encodeURIComponent(term)}`, {
  headers: {
    referer: `${site}/`,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
})
console.log('status', response.status)
const html = await response.text()
console.log('bytes', html.length)

const doc = parseHtml(html)
const anchors = doc.select('a[href*="/vod/detail/id/"]')
console.log('detail anchors:', anchors.length)

for (const anchor of anchors.slice(0, 8)) {
  const chain = []
  let node = anchor.parent
  let depth = 0
  while (node !== null && depth < 5) {
    chain.push(`${node.tag}.${(node.className || '-').replace(/\s+/g, '.')}`)
    node = node.parent
    depth += 1
  }
  console.log('---')
  console.log('href :', anchor.attr('href'))
  console.log('tag  :', anchor.tag, 'class=', anchor.className || '-', 'title-attr=', anchor.attr('title') ?? '-')
  console.log('text :', anchor.text().slice(0, 40))
  console.log('chain:', chain.join(' < '))
  console.log('parenttext:', (anchor.parent?.text() ?? '').slice(0, 60))
}

// Where do the titles really live? Look for the usual card title nodes.
for (const selector of ['.module-card-title', '.module-item-title', 'h3', '.title', 'img[alt]', '.module-item-caption']) {
  const hits = doc.select(selector)
  if (hits.length === 0) continue
  console.log(`\n${selector} -> ${hits.length}`)
  for (const hit of hits.slice(0, 5)) {
    const text = hit.tag === 'img' ? hit.attr('alt') : hit.text()
    console.log(`   ${text?.slice(0, 40)}`)
  }
}
