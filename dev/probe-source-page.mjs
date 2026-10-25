/**
 * Why a source's detail/play page does not yield a media URL.
 *
 *   node dev/probe-source-page.mjs <detailUrl>
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const target = process.argv[2]
if (target === undefined) {
  console.log('usage: node dev/probe-source-page.mjs <detailUrl>')
  process.exitCode = 1
} else {
  const origin = new URL(target).origin
  const headers = { 'user-agent': UA, referer: `${origin}/` }
  const detail = await fetch(target, { headers })
  const html = await detail.text()
  console.log(`detail ${detail.status} ${html.length} bytes`)
  for (const marker of ['dropdown-menu', 'playlist', 'playlink', 'player_aaaa', 'm3u8', 'iframe', 'encrypt']) {
    if (html.includes(marker)) console.log(`  has ${marker}`)
  }

  const links = [...html.matchAll(/href="([^"]*(?:play|vod-play|\/v\/)[^"]*)"/g)]
    .map((match) => match[1])
    .slice(0, 4)
  console.log(`  play links: ${JSON.stringify(links)}`)

  const first = links[0]
  if (first === undefined) {
    console.log('  no play link found')
  } else {
    const url = new URL(first, target).toString()
    const page = await fetch(url, { headers })
    const playHtml = await page.text()
    console.log(`play   ${page.status} ${playHtml.length} bytes  ${url.slice(0, 90)}`)
    for (const marker of ['player_aaaa', 'm3u8', '.mp4', '<iframe', 'url=']) {
      if (playHtml.includes(marker)) console.log(`  has ${marker}`)
    }
    const at = playHtml.indexOf('player_aaaa')
    if (at >= 0) console.log(`  ${playHtml.slice(at, at + 320).replace(/\s+/g, ' ')}`)
    const media = /https?:\/\/[^"'\s\\]+?\.(?:m3u8|mp4)[^"'\s\\]*/i.exec(playHtml)
    console.log(`  media: ${media === null ? '(none)' : media[0].slice(0, 100)}`)
  }
}
