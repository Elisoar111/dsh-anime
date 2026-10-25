// Draws the new detail tabs with the plugin's real stylesheet and real answers
// from the host, so the layout can be looked at without opening the app (the GUI
// needs a login token this session does not have).
//
//   node dev/preview-detail-order.mjs [anilistId]
import { readFileSync, writeFileSync } from 'node:fs'

const HOST = process.env.DSH_ANIME_API ?? 'http://127.0.0.1:13196/dsh-anime/api'
const id = Number(process.argv[2] ?? 16498)
const client = readFileSync('D:/新建文件夹 (2)/dsh-anime/client.js', 'utf8')

const start = client.indexOf('    const CSS = `')
if (start < 0) throw new Error('CSS literal not found')
const bodyStart = start + '    const CSS = `'.length
const css = client.slice(bodyStart, client.indexOf('`\n', bodyStart))

const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])

const order = await (await fetch(`${HOST}/anilist/watchorder?id=${id}`)).json()
const themes = await (await fetch(`${HOST}/animethemes/themes?id=${id}`)).json()
const videos = await (await fetch(`${HOST}/bili/videos?keyword=${encodeURIComponent('進撃の巨人 OP')}&page=1`)).json()
const items = order.data?.items ?? []

const orderRows = items
  .map((item, index) => {
    const current = item.relation === 'CURRENT'
    const label = current ? '本作' : item.relation === 'PREQUEL' ? '前作' : '续作'
    const meta = [item.format, item.episodes === null ? null : `${item.episodes} 话`, item.year].filter(Boolean).join(' · ')
    return `<button class="dshan-worow" type="button" data-current="${current}" data-link="${!current}">
      <span class="dshan-wonum">${index + 1}</span>
      ${item.cover ? `<img class="dshan-wocover" src="${esc(item.cover)}" alt="" loading="lazy">` : ''}
      <span class="dshan-womain">
        <span class="dshan-worel" data-current="${current}">${label}</span>
        <span class="dshan-wotitle">${esc(item.title)}</span>
        ${meta ? `<span class="dshan-rowsub">${esc(meta)}</span>` : ''}
      </span>
    </button>`
  })
  .join('\n')

const biliRows = (videos.data?.items ?? [])
  .slice(0, 6)
  .map(
    (video) => `<div class="dshan-theme" data-open="false">
      <div class="dshan-themerow">
        ${video.cover ? `<img class="dshan-themecover" src="${esc(video.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <span class="dshan-thememain">
          <span class="dshan-themetitle">${esc(video.title)}</span>
          <span class="dshan-rowsub">${esc(
            [video.author, video.duration, video.play > 0 ? `▶ ${video.play}` : null].filter(Boolean).join(' · '),
          )}</span>
        </span>
        <button class="dshan-btn" type="button">播放</button>
      </div>
    </div>`,
  )
  .join('\n')

const seg = (active) => `<div class="dshan-themesrc">
  <div class="dshan-seg">
    <button type="button" data-active="${active === 'themes'}">animethemes</button>
    <button type="button" data-active="${active === 'bilibili'}">哔哩哔哩</button>
  </div>
  ${active === 'bilibili' ? '<span class="dshan-rowsub">animethemes 取不到，已切到哔哩哔哩</span>' : ''}
</div>`

const biliPane = `${seg('bilibili')}
  <div class="dshan-toolbar"><input class="dshan-input" value="進撃の巨人 OP" placeholder="搜歌名 / 视频"><button class="dshan-btn" type="button">搜索</button></div>
  <div class="dshan-themes">${biliRows}</div>`

const themeErrPane = `${seg('themes')}
  <div class="dshan-rowsub">主题曲查询失败：animethemes.moe 取不到主题曲（api.animethemes.moe responded 500: {"message":"Server Error"}）</div>
  <button class="dshan-btn" type="button" style="margin-top:10px">哔哩哔哩 →</button>`

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>detail tabs</title><style>
html,body{margin:0;background:#0b0d10;color:#e8ecf4;font-family:system-ui,"Segoe UI",sans-serif}
.wrap{display:flex;gap:20px;padding:22px;align-items:flex-start}
.col{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-1,#0f1216);border:1px solid #1e242c;border-radius:14px;padding:16px}
${css}
</style></head><body><div class="wrap">
  <div class="col"><div class="dshan-section">观看顺序 · ${items.length}</div><div class="dshan-watchorder">${orderRows}</div></div>
  <div class="col">${biliPane}</div>
  <div class="col">${themeErrPane}</div>
</div></body></html>`

writeFileSync('D:/新建文件夹 (2)/dsh-anime/dev/preview-detail-order.html', html)
console.log(
  `wrote dev/preview-detail-order.html | items ${items.length} | themes ok ${themes.ok === true} | bili videos ${videos.data?.items?.length ?? 0}`,
)
