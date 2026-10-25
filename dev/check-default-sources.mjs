#!/usr/bin/env node
// 新用户装好插件后应当只有 AniList 是开着的，其余数据源/种子流/在线流默认关闭。
// 同时守住一个容易漏的路径：给一条默认关闭的源改设置（比如填镜像地址），
// 不能把它的 enabled 隐式写成 true。
import { readFileSync } from 'node:fs'
import { createExtensionRegistry } from '../lib/extensions.js'

const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8')

// 从真实的注册块里抽 id / name / type / defaultEnabled，避免这里再抄一份清单。
const manifests = []
let cursor = 0
while (true) {
  const at = index.indexOf('registry.register({', cursor)
  if (at < 0) break
  // 到下一个注册块为止：否则 900 字的窗口会吃进下一条源的 defaultEnabled。
  const nextAt = index.indexOf('registry.register({', at + 19)
  const stop = nextAt < 0 ? at + 900 : Math.min(nextAt, at + 900)
  const block = index.slice(at, stop)
  const id = block.match(/id: '([^']+)'/)?.[1]
  const name = block.match(/name: '([^']+)'/)?.[1]
  const type = block.match(/type: '(\w+)'/)?.[1]
  if (id !== undefined && type !== undefined) {
    manifests.push({
      id,
      name: name ?? id,
      type,
      defaultEnabled: !/defaultEnabled: false/.test(block),
      fields: [{ key: 'note', type: 'text', label: 'note', default: '' }],
      handlers: {},
    })
  }
  cursor = at + 18
}

// AnimeFlow 的声明式源（src-*）在 lib/websource.js 里建 manifest，不走 index.js 的注册块。
const websource = readFileSync(new URL('../lib/websource.js', import.meta.url), 'utf8')
const wsManifest = websource.slice(websource.indexOf('const manifest = {'), websource.indexOf("registry.register({ manifest, handlers"))

const results = []
const ok = (label, pass, detail) => results.push({ label, pass, detail })

ok('manifests found', manifests.length >= 9, `${manifests.length} registered`)
ok('declarative src-* ships off', /defaultEnabled: false/.test(wsManifest))

let settings = { extensions: {} }
const registry = createExtensionRegistry({
  getSettings: () => settings,
  saveSettingsPatch: async (patch) => {
    settings = { ...settings, ...patch }
  },
})
for (const manifest of manifests) registry.register({ manifest, handlers: {} })

const on = registry.list().filter((item) => item.enabled).map((item) => item.id)
ok('only anilist is on by default', on.length === 1 && on[0] === 'anilist', on.join(',') || '(none)')
const stillOn = manifests
  .map((manifest) => manifest.id)
  .filter((id) => id !== 'anilist' && registry.enabledOf(id) === true)
ok('every other source ships off', stillOn.length === 0, stillOn.join(',') || `${manifests.length - 1} sources off`)

// 改设置不该偷偷把一条默认关闭的源打开。
await registry.saveSettings('bangumi', { note: 'mirror' })
ok('saving settings keeps it off', registry.enabledOf('bangumi') === false, String(registry.enabledOf('bangumi')))

// 用户显式打开之后要能记住，改设置也不能把它关回去。
await registry.setEnabled('bangumi', true)
await registry.saveSettings('bangumi', { note: 'mirror2' })
ok('explicit enable survives a save', registry.enabledOf('bangumi') === true, String(registry.enabledOf('bangumi')))

// AniList 自己改设置也必须是开着。
await registry.saveSettings('anilist', { note: 'x' })
ok('anilist stays on after a save', registry.enabledOf('anilist') === true, String(registry.enabledOf('anilist')))

let failed = 0
for (const row of results) {
  if (!row.pass) failed += 1
  console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
