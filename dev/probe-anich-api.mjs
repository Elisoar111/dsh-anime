// AniCh 后端 API 探针：带 `_` 认证头（protobuf token_）读各端点形状。
// 先跑 dev/probe-anich-login.mjs 把 token 落到 %TEMP%/anich-token.json。

import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = process.env.ANICH_HOST ?? 'https://ani.emmmm.eu.org'
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

function authHeader(token) {
  const time = (Date.now() + 60_000).toString(16)
  return [...fieldString(1, token), ...fieldString(2, time)].join(',')
}

const store = JSON.parse(readFileSync(join(tmpdir(), 'anich-token.json'), 'utf8'))
const header = authHeader(store.token)
console.log(`token len=${store.token.length} headerLen=${header.length}`)

const PATHS = [
  '/bangumi/latest',
  '/bangumi/list?skip=0',
  '/bangumi/tag?type=genre&skip=0',
  '/bangumi/detail/253',
  '/bangumi/episodes/253',
  '/bangumi/search?q=%E6%9F%AF%E5%8D%97',
  '/latest',
  '/tags',
  '/vod/253/1',
]

for (const path of PATHS) {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(HOST + path, {
      headers: { 'user-agent': UA, _: header, accept: '*/*' },
      signal: controller.signal,
    })
    const buffer = Buffer.from(await response.arrayBuffer())
    const type = response.headers.get('content-type') ?? ''
    console.log(`${path} -> ${response.status} ${type} len=${buffer.length} (${Date.now() - started}ms)`)
    if (type.includes('json')) {
      console.log('   ', buffer.subarray(0, 400).toString('utf8').replace(/\s+/g, ' '))
    } else {
      const ascii = buffer.subarray(0, 48).toString('utf8').replace(/[^\x20-\x7e]/g, '.')
      console.log(`    hex: ${[...buffer.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join(' ')}  ascii: ${ascii}`)
      const urls = buffer.toString('utf8').match(/https?:\/\/[^\s"'\\]+/g)
      if (urls) console.log(`    urls: ${urls.slice(0, 3).join(' | ')}`)
    }
  } catch (error) {
    console.log(`${path} -> ERR ${error?.message ?? error}${error?.cause?.code ? ` (${error.cause.code})` : ''} (${Date.now() - started}ms)`)
  } finally {
    clearTimeout(timer)
  }
}
