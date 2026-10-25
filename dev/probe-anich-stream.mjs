// Bounded probe for /online/stream on one source+episode+server.
// Usage: DSH_PORT=3426 node dev/probe-anich-stream.mjs "anich" "39482|1" "线路1"
const port = process.env.DSH_PORT ?? '3426'
const source = process.argv[2] ?? 'anich'
const episode = process.argv[3] ?? '39482|1'
const server = process.argv[4] ?? '线路1'

const url =
  `http://127.0.0.1:${port}/dsh-anime/api/online/stream` +
  `?source=${encodeURIComponent(source)}&episode=${encodeURIComponent(episode)}&server=${encodeURIComponent(server)}`

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 20000)
const started = Date.now()
try {
  const response = await fetch(url, { signal: controller.signal })
  const type = response.headers.get('content-type') ?? ''
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    chunks.push(chunk)
    total += chunk.byteLength
    if (total >= 400000) break
  }
  const head = Buffer.concat(chunks).subarray(0, 48)
  console.log(JSON.stringify({
    status: response.status,
    type,
    ms: Date.now() - started,
    bytes: total,
    head: head.toString('utf8').replace(/[^\x20-\x7e]/g, '.'),
  }))
} catch (error) {
  // A JSON body from the Host explains the failure; print it when present.
  console.log(JSON.stringify({ error: String(error?.message ?? error), ms: Date.now() - started }))
} finally {
  clearTimeout(timer)
}
