/**
 * Visual harness for the browse page.
 *
 * It reuses the plugin's real stylesheet (the `CSS` template literal in
 * client.js) so the picture cannot drift from what ships, and fills the rail
 * and the poster grid with a real `/anilist/browse` answer. The markup here is
 * the same element structure the component emits — this script exists to look
 * at the layout, not to test behaviour (`dev/render-check.mjs` does that).
 *
 *   node dev/preview-browse.mjs            # writes dev/preview-browse.html
 */
import { readFileSync, writeFileSync } from 'node:fs'

const HOST = 'http://127.0.0.1:40070/dsh-anime/api'
const client = readFileSync('D:/新建文件夹 (2)/dsh-anime/client.js', 'utf8')

const cssStart = client.indexOf('    const CSS = `')
if (cssStart < 0) throw new Error('CSS literal not found')
const bodyStart = cssStart + '    const CSS = `'.length
const bodyEnd = client.indexOf('`\n', bodyStart)
const css = client.slice(bodyStart, bodyEnd)

const query = process.argv[2] ?? 'genre=Action&sort=POPULARITY_DESC&perPage=24'
const payload = await (await fetch(`${HOST}/anilist/browse?${query}`)).json()
if (payload.ok !== true) throw new Error(JSON.stringify(payload).slice(0, 300))
const items = payload.data.items

const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

const ico = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16.2 16.2 21 21',
  sort: 'M3 6h11M3 12h7M3 18h4M17 6v12M14 15l3 3 3-3',
  genre: 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.3 9.4l6.1-.8z',
  tag: 'M20.6 13.4 13 21 3 11V3h8l9.6 9.6a1.4 1.4 0 0 1 0 .8ZM7.5 7.5h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  score: 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.3 9.4l6.1-.8z',
  trash: 'M3 6h18M8 6V3.8h8V6M5.5 6l1 14h11l1-14',
}

const svg = (d) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`

const row = (icon, label, chip, active = false) =>
  `<div class="dshan-railrow" data-active="${active}"><span class="dshan-railicon">${svg(icon)}</span><span class="dshan-raillabel">${esc(label)}</span><span class="dshan-railchev">▾</span></div>`

const rail = `
<div class="dshan-rail">
  <div class="dshan-railrow dshan-railinput"><span class="dshan-railicon">${svg(ico.search)}</span><input placeholder="标题…"></div>
  ${row(ico.sort, '人气最高', '', true)}
  ${row(ico.genre, 'Action', '', true)}
  <div class="dshan-railrow dshan-railinput"><span class="dshan-railicon">${svg(ico.tag)}</span><input placeholder="所有标签"></div>
  ${row(ico.grid, '所有格式')}
  ${row(ico.calendar, '所有季度')}
  ${row(ico.calendar, '所有年份')}
  ${row(ico.clock, '所有状态')}
  ${row(ico.score, '所有评分')}
  <div class="dshan-railrow dshan-railtoggle"><span class="dshan-switch" data-on="false"></span><span class="dshan-raillabel">成人内容</span></div>
  <div class="dshan-railrow"><span class="dshan-railicon">${svg(ico.trash)}</span><span class="dshan-raillabel">清空筛选</span></div>
</div>`

const card = (media) => {
  const when = media.season && media.seasonYear ? `${media.season} ${media.seasonYear}` : media.seasonYear ?? ''
  return `<button class="dshan-bcard" type="button">
  <div class="dshan-bcover">
    ${media.cover ? `<img src="${esc(media.cover)}" alt="">` : '<div class="dshan-ph">无封面</div>'}
    ${media.status === 'RELEASING' ? '<span class="dshan-bflag">连载中</span>' : ''}
    ${media.score ? `<span class="dshan-bscore">★ ${media.score}</span>` : ''}
  </div>
  <div class="dshan-btitle">${esc(media.title)}</div>
  <div class="dshan-bmeta">${esc(when)}${typeof media.episodes === 'number' ? `<span>· ${media.episodes}集</span>` : ''}</div>
</button>`
}

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>browse preview</title><style>
html,body{margin:0;background:#0b0d10;color:#e8ecf4;font-family:system-ui,"Segoe UI",sans-serif}
.wrap{padding:18px}
${css}
</style></head><body><div class="wrap"><div class="dshan-browse">${rail}
<div class="dshan-bmain">
  <div class="dshan-bgrid">${items.map(card).join('\n')}</div>
  <div class="dshan-bmeta" style="justify-content:space-between"><span>共 ${payload.data.total}</span><button class="dshan-btn">加载更多</button></div>
</div></div></div></body></html>`

writeFileSync('D:/新建文件夹 (2)/dsh-anime/dev/preview-browse.html', html)
console.log('wrote dev/preview-browse.html', items.length, 'items, css', css.length, 'chars')
