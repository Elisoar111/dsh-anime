#!/usr/bin/env node
// 主题曲的播放器是不是我们自己的 Player（而不是浏览器原生 <video controls>）。
// 只读源码做断言：这个面板里一旦有人把它换回 <video>，线路/清晰度/预加载段就全没了。
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const results = []
const ok = (name, pass, detail) => results.push({ name, pass, detail })

const start = client.indexOf('function ThemesList(')
const end = client.indexOf('function ', start + 10)
const themes = start >= 0 && end > start ? client.slice(start, end) : ''
ok('ThemesList found', themes.length > 1000, `${themes.length} chars`)

ok(
  'renders the shared Player',
  /h\(Player, \{/.test(themes),
  /h\(Player, \{/.test(themes) ? 'h(Player' : 'no h(Player call',
)
ok('no native <video controls> left', !/className: 'dshan-themeplayer'/.test(themes))
ok(
  'qn is in the stream url',
  /\$\{API\}\/bili\/stream\?bvid=\$\{video\.bvid\}&cid=\$\{cid\}&qn=\$\{qn\}/.test(themes),
)
ok('quality ladder passed in', /qualityOptions: BILI_THEME_QUALITIES/.test(themes))
ok('quality is controlled', /quality: qn,/.test(themes) && /onQuality:/.test(themes))
ok('position survives a quality switch', /startAt: qat,/.test(themes) && /onTime:/.test(themes))
ok('close button wired', /onClose: \(\) => setOpen\(null\)/.test(themes))

const ladder = client.match(/const BILI_THEME_QUALITIES = \[([\s\S]*?)\]/)
const ladderEntries = ladder ? ladder[1].match(/value: \d+/g) ?? [] : []
ok('ladder has 4 rungs', ladderEntries.length === 4, ladderEntries.join(' '))

ok('button says 播放, not 试听', client.includes("playTheme: '播放',") && !client.includes("playTheme: '试听',"))

let failed = 0
for (const row of results) {
  if (!row.pass) failed += 1
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}${row.detail ? ` — ${row.detail}` : ''}`)
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
