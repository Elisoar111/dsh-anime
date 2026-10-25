// 探 AniCh 的 /vod/{id}/{ep}：真实线路有几条、caption 是什么、地址能不能连。
// 凭据从宿主的 state 目录读，绝不打印密码。
//
//   node dev/probe-anich-vod.mjs [animeId] [episode]

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as anich from '../lib/anich.js'

const STATE = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'state', 'dsh-anime')
const settings = JSON.parse(readFileSync(join(STATE, 'settings.json'), 'utf8'))
const stored = settings?.extensions?.anich ?? {}
const accounts = JSON.parse(readFileSync(join(STATE, 'accounts.json'), 'utf8'))
const account = accounts?.providers?.anich ?? {}

const base = String(stored.apiBase ?? 'https://ani.emmmm.eu.org').trim()
const animeId = process.argv[2] ?? '39482'
const episode = Number(process.argv[3] ?? 1)

function token() {
  const saved = String(account?.secret ?? '')
  if (saved !== '') return saved
  return null
}

let current = token()
if (current === null) {
  const user = String(stored.user ?? '')
  const password = String(stored.password ?? '')
  if (user === '' || password === '') {
    console.error('!! 没有可用凭据（accounts.json 无 secret，settings 无账号密码）')
    process.exit(1)
  }
  const result = await anich.login({ base, user, password })
  current = result.token
  console.log('login: ok')
} else {
  console.log('login: 复用 accounts.json 里的 token')
}

console.log(`base=${base} anime=${animeId} episode=${episode}`)
const started = Date.now()
const lines = await anich.sources({ base, token: current, id: animeId, episode })
console.log(`sources: ${lines.length} 条 ${Date.now() - started}ms`)

lines.forEach((line, index) => {
  const tail = line.url.length > 96 ? `${line.url.slice(0, 96)}…` : line.url
  console.log(`${String(index + 1).padStart(2)}. sort=${String(line.sort).padEnd(3)} type=${line.type.padEnd(4)} caption=${JSON.stringify(line.caption)} url=${tail}`)
})

// 每条线路的地址真能不能取到东西：只看首字节与 content-type，不下整片。
for (const [index, line] of lines.entries()) {
  const headers = { 'user-agent': 'Mozilla/5.0', referer: `${base}/` }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(line.url, { headers, signal: controller.signal })
    let head = ''
    if (response.body !== null) {
      const reader = response.body.getReader()
      const chunk = await reader.read()
      head = Buffer.from(chunk.value ?? new Uint8Array()).subarray(0, 20).toString('utf8').replace(/\n/g, '\\n')
      await reader.cancel().catch(() => undefined)
    }
    console.log(`   #${index + 1} ${response.status} ${response.headers.get('content-type') ?? '-'} ${head}`)
  } catch (error) {
    console.log(`   #${index + 1} ERR ${error?.message ?? error}`)
  } finally {
    clearTimeout(timer)
  }
}
