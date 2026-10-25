// 用抽出来的 schema 解码 AniCh 的 protobuf 端点，确认「搜索 → 详情 → 剧集 → 线路地址」能否跑通。
// 依赖 %TEMP%/anich-token.json（先跑 dev/probe-anich-login.mjs）。

import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSchema, decodeList } from './anich-schema.mjs'

const HOST = process.env.ANICH_HOST ?? 'https://ani.emmmm.eu.org'
const UA = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'
const schema = loadSchema()

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

const store = JSON.parse(readFileSync(join(tmpdir(), 'anich-token.json'), 'utf8'))
const auth = [...fieldString(1, store.token), ...fieldString(2, (Date.now() + 60_000).toString(16))].join(',')

async function get(path) {
  const response = await fetch(HOST + path, {
    headers: { 'user-agent': UA, _: auth, accept: '*/*' },
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  return { status: response.status, type: response.headers.get('content-type') ?? '', buffer }
}

function decodeListOf(buffer, typeName) {
  // 顶层是「repeated 消息」时，decodeList 会逐条 decodeMessage。
  return decodeList(buffer, typeName, schema).map((entry) => entry.value)
}

const latest = await get('/bangumi/latest')
const latestItems = decodeListOf(latest.buffer, 'bangumi_latest_item_')
console.log(`latest ${latest.status} items=${latestItems.length}`)
console.log('  first:', JSON.stringify(latestItems[0]))

const list = await get('/bangumi/list?skip=0')
const listItems = decodeListOf(list.buffer, 'bangumi_list_item_')
console.log(`list ${list.status} items=${listItems.length}`)
console.log('  first:', JSON.stringify(listItems[0]))

const keyword = encodeURIComponent('柯南')
for (const path of [`/bangumi/search?keyword=${keyword}`, `/bangumi/search?keyword=${keyword}&skip=0`]) {
  try {
    const search = await get(path)
    console.log(`search ${path} -> ${search.status} ${search.type} len=${search.buffer.length}`)
    if (search.type.includes('json')) {
      console.log('   ', search.buffer.subarray(0, 200).toString('utf8'))
    } else {
      const items = decodeListOf(search.buffer, 'bangumi_list_item_')
      console.log(`   items=${items.length} first=${JSON.stringify(items[0])}`)
    }
  } catch (error) {
    console.log(`search ${path} -> ERR ${error?.message ?? error}`)
  }
}

const target = latestItems[0]?.id ?? 1
const episodes = await get(`/bangumi/episodes/${target}`)
let episodeList = []
if (episodes.type.includes('json')) {
  console.log(`episodes ${target} -> json ${episodes.buffer.subarray(0, 200).toString('utf8')}`)
} else {
  const parsed = decodeListOf(episodes.buffer, 'bangumi_episodes_data_')
  episodeList = parsed
  console.log(`episodes ${target} -> ${episodes.status} items=${parsed.length}`)
  console.log('  first:', JSON.stringify(parsed[0]))
  console.log('  last:', JSON.stringify(parsed[parsed.length - 1]))
}

for (const episode of [1, 2]) {
  const vod = await get(`/vod/${target}/${episode}`)
  console.log(`vod ${target}/${episode} -> ${vod.status} ${vod.type} len=${vod.buffer.length}`)
  if (vod.type.includes('json')) {
    console.log('   ', vod.buffer.subarray(0, 300).toString('utf8'))
  } else {
    const items = decodeListOf(vod.buffer, 'vod_item_')
    console.log(`   items=${items.length}`)
    for (const item of items.slice(0, 4)) console.log('   ', JSON.stringify(item))
  }
}
