// 从 AniCh 的 Dart protobuf 生成文件里抽出消息 schema（消息名 → {tag: {name, kind}}）。
// 用法：node dev/anich-schema.mjs [--emit path]
// 只读 reference/AniCh/lib/protobuf/*.pb.dart。

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.ANICH_PB_DIR ?? 'D:/新建文件夹 (2)/reference/AniCh/lib/protobuf'

const KIND = {
  OS: 'string',
  OB: 'bool',
  OI: 'int',
  O3: 'int64',
  OF: 'float',
  OD: 'double',
  OM: 'message',
  OMS: 'message[]',
  OM3: 'message[]',
  OS3: 'string[]',
  OI3: 'int[]',
  O3I: 'int64',
}

export function loadSchema(dir = DIR) {
  const schema = {}
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.pb.dart'))) {
    const source = readFileSync(join(dir, file), 'utf8')
    const blocks = source.split(/\nclass /).slice(1)
    for (const block of blocks) {
      const nameMatch = block.match(/^(\w+) extends \$pb\.GeneratedMessage/)
      if (!nameMatch) continue
      const name = nameMatch[1]
      const fields = {}
      // 生成文件里每个字段都是「@$pb.TagNumber(n) + 类型 get name」；
      // 标量是 `$core.xxx`，消息类型直接写类名（如 `login_body_ get body`）。
      const re = /@\$pb\.TagNumber\((\d+)\)\s*\n\s*(\$core\.)?([\w.]+)(?:<([\w.]+)>)? get (\w+)/g
      let match
      while ((match = re.exec(block)) !== null) {
        const [, tag, core, type, sub, field] = match
        let kind
        if (core === '$core.') {
          kind = type === 'String' ? 'string' : type === 'bool' ? 'bool' : type === 'List' ? 'list' : 'number'
          if (type === 'List' && sub) kind = `message[]:${sub}`
        } else {
          kind = `message:${type}`
          if (type === 'List' && sub) kind = `message[]:${sub}`
        }
        fields[Number(tag)] = { name: field, kind }
      }
      schema[name] = fields
    }
  }
  return schema
}

export function decodeMessage(buffer, typeName, schema, depth = 0) {
  const fields = schema[typeName] ?? {}
  const out = {}
  let index = 0
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
  while (index < buffer.length) {
    const key = readVarint()
    const tag = Math.floor(key / 8)
    const wire = key & 7
    const spec = fields[tag]
    const name = spec?.name ?? `field${tag}`
    const kind = spec?.kind ?? 'unknown'
    if (wire === 0) {
      const value = readVarint()
      if (kind === 'bool') out[name] = value === 1
      else out[name] = value
      continue
    }
    if (wire === 2) {
      const length = readVarint()
      const slice = buffer.subarray(index, index + length)
      index += length
      if (kind.startsWith('message:') && depth < 8) {
        out[name] = decodeMessage(slice, kind.slice('message:'.length), schema, depth + 1)
      } else if (kind.startsWith('message[]:')) {
        const sub = kind.slice('message[]:'.length)
        if (!Array.isArray(out[name])) out[name] = []
        out[name].push(decodeMessage(slice, sub, schema, depth + 1))
      } else {
        const text = slice.toString('utf8')
        if (Array.isArray(out[name]) || kind.endsWith('[]')) {
          if (!Array.isArray(out[name])) out[name] = []
          out[name].push(text)
        } else {
          out[name] = text
        }
      }
      continue
    }
    if (wire === 5) {
      index += 4
      continue
    }
    if (wire === 1) {
      index += 8
      continue
    }
    break
  }
  return out
}

export function decodeList(buffer, typeName, schema) {
  const items = []
  let index = 0
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
  while (index < buffer.length) {
    const key = readVarint()
    const tag = Math.floor(key / 8)
    const wire = key & 7
    if (wire !== 2) break
    const length = readVarint()
    const slice = buffer.subarray(index, index + length)
    index += length
    items.push({ tag, value: decodeMessage(slice, typeName, schema) })
  }
  return items
}

if (process.argv[1]?.endsWith('anich-schema.mjs')) {
  const schema = loadSchema()
  const names = Object.keys(schema)
  console.log(`messages: ${names.length}`)
  for (const name of names.slice(0, 40)) {
    console.log(`  ${name}: ${Object.entries(schema[name]).map(([tag, spec]) => `${tag}=${spec.name}:${spec.kind}`).join(' ')}`)
  }
  const emit = process.argv.indexOf('--emit')
  if (emit > 0) {
    writeFileSync(process.argv[emit + 1], JSON.stringify(schema, null, 2), 'utf8')
    console.log(`wrote ${process.argv[emit + 1]}`)
  }
}
