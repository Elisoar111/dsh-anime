/**
 * Development probe: what does the AniBT site expose to a browser?
 * Runs standalone so the slow first byte does not block other work.
 *
 *   node dev/probe-anibt.mjs
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function get(url, timeoutMs = 90000) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    })
    const text = await response.text()
    return { ok: true, status: response.status, text, ms: Date.now() - started, headers: response.headers }
  } catch (error) {
    return { ok: false, status: 0, text: '', ms: Date.now() - started, error: `${error.name}: ${error.message}` }
  } finally {
    clearTimeout(timer)
  }
}

const home = await get('https://www.anibt.net/')
console.log('home:', home.ok ? `HTTP ${home.status} in ${home.ms}ms, ${home.text.length} bytes` : home.error)

if (home.ok) {
  const nextData = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(home.text)
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData[1])
      console.log('buildId:', parsed.buildId)
      console.log('page:', parsed.page)
      console.log('query:', JSON.stringify(parsed.query))
      console.log('pageProps keys:', Object.keys(parsed.props?.pageProps ?? {}).join(', '))
      const sample = JSON.stringify(parsed.props?.pageProps ?? {}).slice(0, 1200)
      console.log('pageProps sample:', sample)
    } catch (error) {
      console.log('__NEXT_DATA__ parse failed:', error.message)
    }
  } else {
    console.log('no __NEXT_DATA__')
  }

  const apiPaths = [...new Set(
    [...home.text.matchAll(/["'`](\/api\/[a-zA-Z0-9_\-/{}.:?=&]+)["'`]/g)].map((m) => m[1]),
  )].slice(0, 40)
  console.log('\n/api paths in HTML:', apiPaths.length ? apiPaths.join('\n  ') : '(none)')

  const absoluteApi = [...new Set(
    [...home.text.matchAll(/https?:\/\/[a-zA-Z0-9.\-]*anibt[a-zA-Z0-9.\-]*\/[a-zA-Z0-9_\-/.?=&{}]*/g)].map((m) => m[0]),
  )].slice(0, 20)
  console.log('\nanibt URLs in HTML:', absoluteApi.length ? absoluteApi.join('\n  ') : '(none)')

  for (const keyword of ['m3u8', 'mp4', 'hls', 'videoUrl', 'sources', 'episodeUrl']) {
    const count = (home.text.match(new RegExp(keyword, 'g')) ?? []).length
    console.log(`keyword ${keyword}: ${count}`)
  }

  const scripts = [...new Set([...home.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))]
  console.log('\nscript srcs:', scripts.slice(0, 10).join('\n  '))
}
