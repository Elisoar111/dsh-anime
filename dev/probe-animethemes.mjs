// The plugin's own fetch reached animethemes and got a 422, so this is a query
// shape problem, not a network wall. Try the plausible shapes and keep whoever
// answers 200.
const base = 'https://api.animethemes.moe/anime'
const variants = [
  '?filter[has]=resources&filter[resource]=AniList&filter[external_id]=16498&include=animethemes.song',
  '?filter[has]=resources&filter[resource]=AniList&filter[external_id]=16498&include=animethemes.song,animethemes.animethemeentries.videos',
  '?filter[external_id]=16498&include=animethemes.song',
  '?filter[external_id]=16498',
]

for (const suffix of variants) {
  const url = base + suffix
  const started = Date.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const text = await response.text()
    const seconds = ((Date.now() - started) / 1000).toFixed(1)
    let note = ''
    if (response.ok) {
      try {
        const data = JSON.parse(text)
        const anime = Array.isArray(data.anime) ? data.anime : []
        const first = anime[0]
        note = `anime=${anime.length} name=${first?.name ?? '-'} themes=${first?.animethemes?.length ?? 0}`
      } catch {
        note = 'non-json'
      }
    } else {
      note = text.slice(0, 160).replace(/\s+/g, ' ')
    }
    console.log(`[${response.status}] ${seconds}s ${suffix}\n    ${note}`)
  } catch (error) {
    console.log(`[ERR] ${((Date.now() - started) / 1000).toFixed(1)}s ${suffix}\n    ${error instanceof Error ? error.message : error}`)
  }
}
