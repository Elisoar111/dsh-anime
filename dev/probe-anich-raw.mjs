/**
 * Dumps the raw bytes `/register` answers with, so the decoder can be checked
 * against the real shape instead of against our guess.
 *
 * Sends 验证码 000000 with a `.invalid` address: the request cannot create an
 * account, so the interesting part is purely the error response's encoding.
 *
 *   node dev/probe-anich-raw.mjs [base] [path]
 */
const base = String(process.argv[2] ?? 'https://ani.emmmm.eu.org')
const path = String(process.argv[3] ?? '/register')

function varint(value) {
  const out = []
  let v = Number(value)
  while (v >= 0x80) {
    out.push((v % 128) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return out
}

function encodeString(tag, text) {
  const bytes = [...Buffer.from(String(text), 'utf8')]
  return [...varint((tag << 3) | 2), ...varint(bytes.length), ...bytes]
}

const data = [
  ...encodeString(1, 'probe@example.invalid'),
  ...encodeString(2, '000000'),
  ...encodeString(3, 'dsh-anime-probe'),
  ...encodeString(4, 'probe-not-a-real-password'),
].join(',')

const response = await fetch(base.replace(/\/+$/, '') + path, {
  method: 'POST',
  headers: {
    'user-agent': 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)',
    'content-type': 'application/x-www-form-urlencoded',
    accept: '*/*',
  },
  body: new URLSearchParams({ data }).toString(),
  signal: AbortSignal.timeout(20_000),
})
const buffer = Buffer.from(await response.arrayBuffer())
console.log(`${path} → ${response.status} ${response.headers.get('content-type')} ${buffer.length} bytes`)
console.log(`hex    ${buffer.subarray(0, 48).toString('hex')}`)
console.log(`utf8   ${JSON.stringify(buffer.toString('utf8').slice(0, 200))}`)

// Walk top-level protobuf fields so tag numbers can be read off the wire.
function walk(buffer, depth = 0) {
  let index = 0
  const rows = []
  while (index < buffer.length) {
    const readVarint = () => {
      let shift = 0
      let value = 0
      while (index < buffer.length) {
        const byte = buffer[index++]
        value += (byte & 0x7f) * 2 ** shift
        if ((byte & 0x80) === 0) break
        shift += 7
      }
      return value
    }
    const key = readVarint()
    const tag = key >> 3
    const wire = key & 7
    if (wire === 0) {
      rows.push({ tag, wire, value: readVarint() })
      continue
    }
    if (wire === 2) {
      const length = readVarint()
      const bytes = buffer.subarray(index, index + length)
      index += length
      const text = bytes.toString('utf8')
      const printable = /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(text)
      rows.push({ tag, wire, length, text: printable ? text.slice(0, 120) : undefined })
      continue
    }
    rows.push({ tag, wire, note: 'unsupported wire type' })
    break
  }
  return { rows, depth }
}

try {
  const { rows } = walk(buffer)
  console.log('fields')
  for (const row of rows) console.log('  ', JSON.stringify(row))
} catch (error) {
  console.log(`walk failed: ${error?.message ?? error}`)
}
