// AniCh (Sle2p/AniCh) 后端探针：用账号密码换 token。
// 该站点的接口是 protobuf over form-urlencoded，认证头是 `_`（protobuf token_）。
// 账号密码只从环境变量取，脚本里不留凭据。
//
//   $env:ANICH_USER="..."; $env:ANICH_PASS="..."; node dev/probe-anich-login.mjs
//
// 成功时把 token 写到 %TEMP%/anich-token.json（不进仓库），只打印长度与掩码。

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOSTS = ['https://ani.emmmm.eu.org', 'https://api.500403.xyz', 'https://api.emmmm.eu.org']
const UA = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'

function varint(value) {
  const out = []
  let rest = value >>> 0
  while (rest > 127) {
    out.push((rest & 0x7f) | 0x80)
    rest >>>= 7
  }
  out.push(rest)
  return out
}

function fieldString(tag, text) {
  const bytes = [...Buffer.from(String(text), 'utf8')]
  return [...varint((tag << 3) | 2), ...varint(bytes.length), ...bytes]
}

function decode(buffer) {
  const out = []
  let index = 0
  while (index < buffer.length) {
    let shift = 0
    let key = 0
    while (true) {
      const byte = buffer[index++]
      if (byte === undefined) return out
      key |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    const tag = key >> 3
    const wire = key & 7
    if (wire === 0) {
      let shift2 = 0
      let value = 0
      while (true) {
        const byte = buffer[index++]
        if (byte === undefined) return out
        value |= (byte & 0x7f) << shift2
        if ((byte & 0x80) === 0) break
        shift2 += 7
      }
      out.push({ tag, wire, value })
    } else if (wire === 2) {
      let shift3 = 0
      let length = 0
      while (true) {
        const byte = buffer[index++]
        if (byte === undefined) return out
        length |= (byte & 0x7f) << shift3
        if ((byte & 0x80) === 0) break
        shift3 += 7
      }
      const slice = buffer.subarray(index, index + length)
      index += length
      out.push({ tag, wire, bytes: slice })
    } else if (wire === 5) {
      index += 4
    } else if (wire === 1) {
      index += 8
    } else {
      return out
    }
  }
  return out
}

function text(bytes) {
  return Buffer.from(bytes).toString('utf8')
}

async function login(host, user, password) {
  const payload = [...fieldString(1, user), ...fieldString(2, password)].join(',')
  const body = new URLSearchParams({ data: payload }).toString()
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${host}/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        accept: '*/*',
      },
      body,
      signal: controller.signal,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    return { host, status: response.status, type: response.headers.get('content-type'), buffer, ms: Date.now() - started }
  } catch (error) {
    return { host, error: `${error?.message ?? error}${error?.cause?.code ? ` (${error.cause.code})` : ''}`, ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

const user = String(process.env.ANICH_USER ?? '').trim()
const password = String(process.env.ANICH_PASS ?? '')
if (user === '' || password === '') {
  console.error('需要 ANICH_USER 与 ANICH_PASS 环境变量')
  process.exit(1)
}

for (const host of HOSTS) {
  const result = await login(host, user, password)
  if (result.error) {
    console.log(`${host} -> ERR ${result.error} (${result.ms}ms)`)
    continue
  }
  console.log(`${host} -> ${result.status} ${result.type} len=${result.buffer.length} (${result.ms}ms)`)
  const head = result.buffer.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ')
  console.log(`  raw: ${head.replace(/[^\x20-\x7e]/g, '.')}`)
  const fields = decode(result.buffer)
  let token = ''
  let message = ''
  let error = false
  let loginUser = null
  for (const field of fields) {
    if (field.wire !== 2) {
      if (field.tag === 1) error = field.value === 1
      continue
    }
    if (field.tag === 2) message = text(field.bytes)
    if (field.tag === 3) {
      for (const inner of decode(field.bytes)) {
        if (inner.wire !== 2) continue
        if (inner.tag === 2) token = text(inner.bytes)
        if (inner.tag === 1) {
          const user1 = {}
          for (const leaf of decode(inner.bytes)) {
            if (leaf.wire === 2) user1[leaf.tag] = text(leaf.bytes)
            else user1[leaf.tag] = leaf.value
          }
          loginUser = user1
        }
      }
    }
  }
  console.log(`  error=${error} message=${JSON.stringify(message)} tokenLen=${token.length} user=${JSON.stringify(loginUser)}`)
  if (token.length > 0) {
    const masked = `${token.slice(0, 4)}…${token.slice(-4)}`
    console.log(`  token=${masked}`)
    const file = join(tmpdir(), 'anich-token.json')
    writeFileSync(file, JSON.stringify({ host, token, user: loginUser, at: Date.now() }, null, 2), 'utf8')
    console.log(`  wrote ${file}`)
    break
  }
}
