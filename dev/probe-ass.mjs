// End-to-end probe for the ASS pipeline: real bilibili subtitle -> ASS text.
const routes = new Map()
const { apply } = await import('../index.js')
apply({
  inject: (_deps, cb) => cb({ webServer: { register: (route) => { routes.set(route.path, route); return () => {} } } }),
})

const call = async (path, query) => {
  const out = { status: 0, body: '', headers: {} }
  const response = {
    writeHead: (status, headers) => { out.status = status; out.headers = headers ?? {} },
    setHeader: () => {},
    end: (chunk) => { if (chunk !== undefined) out.body += String(chunk) },
    on: () => {},
    once: () => {},
    write: () => true,
    emit: () => {},
    destroy: () => {},
  }
  await routes.get(path).handler({ method: 'GET', url: `${path}?${query}`, headers: {} }, response)
  return out
}

const subs = JSON.parse((await call('/dsh-anime/api/bili/subtitles', 'bvid=BV1C8nH69EpL&cid=42965076857')).body)
const track = subs?.data?.items?.[0]
console.log('track:', track?.lan, track?.lanDoc, track?.machine)
const query = String(track?.src ?? '').split('?')[1] ?? ''
console.log('query:', query.slice(0, 70))

const ass = await call('/dsh-anime/api/bili/subtitle.vtt', `${query}&format=ass`)
console.log('ass:', ass.status, ass.headers['content-type'], ass.body.length, 'bytes')
const dialogues = ass.body.split('\n').filter((line) => line.startsWith('Dialogue:'))
console.log('dialogues:', dialogues.length)
console.log('first:', dialogues[0]?.slice(0, 110))
process.exit(0)
