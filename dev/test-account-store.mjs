// Account storage + the registry that owns the providers.
//
// Two stores over one directory: the second must see what the first saved —
// that is what "登录成功但显示未登录" looked like with a stale in-memory cache.
// The rest covers the parts that must not depend on the network: the version 1
// file shape, the masked view, and the extension registry handing back handlers.
// The live routes are exercised by dev/test-accounts.mjs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAccountStore, publicAccounts } from '../lib/accounts.js'
import { createExtensionRegistry } from '../lib/extensions.js'
import { anilistAccount } from '../lib/anilist.js'
import { bangumiAccount } from '../lib/bangumi.js'

const results = []
function check(name, actual, expected) {
  results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected })
}

const dir = mkdtempSync(join(tmpdir(), 'dsh-accounts-'))
try {
  const first = createAccountStore(dir)
  const second = createAccountStore(dir)

  check('both empty', publicAccounts(second.load()).bilibili?.loggedIn ?? false, false)

  first.set('bilibili', {
    secret: 'SESSDATA=abc; bili_jct=def',
    fields: { uid: 42, name: '测试用户', avatar: 'https://i0.hdslb.com/x.jpg' },
  })

  const seen = publicAccounts(second.load()).bilibili ?? {}
  check('second sees login', seen.loggedIn, true)
  check('second sees name', seen.name, '测试用户')
  check('second sees uid', seen.uid, 42)
  check('second masks the cookie', (seen.masked ?? '').includes('••••'), true)
  check('secret never leaves', JSON.stringify(seen).includes('SESSDATA'), false)

  second.clear('bilibili')
  check('first sees logout', publicAccounts(first.load()).bilibili ?? null, null)

  // A version 1 file: one hardcoded slot per provider.
  const legacyDir = mkdtempSync(join(dir, 'legacy-'))
  writeFileSync(
    join(legacyDir, 'accounts.json'),
    JSON.stringify({
      bilibili: { cookie: 'SESSDATA=abc; bili_jct=def', mid: 42, uname: '测试号', face: 'https://x/face.jpg', savedAt: 111 },
      anilist: { token: '', userId: null, userName: '', avatar: null, savedAt: null },
      bangumi: { token: 'bgm-token-123456', userId: 7, userName: 'bgm', avatar: null, savedAt: 222 },
    }),
    'utf8',
  )
  const legacy = createAccountStore(legacyDir).load()
  check('v1 cookie migrates to a secret', legacy.providers.bilibili?.secret, 'SESSDATA=abc; bili_jct=def')
  check('v1 mid migrates to fields.uid', legacy.providers.bilibili?.fields?.uid, 42)
  check('v1 empty slot is dropped', legacy.providers.anilist ?? null, null)
  check('v1 bangumi token migrates', legacy.providers.bangumi?.secret, 'bgm-token-123456')

  const onDisk = JSON.parse(readFileSync(join(dir, 'accounts.json'), 'utf8'))
  check('file is version 2', onDisk.version, 2)

  // --- registry ---
  const registry = createExtensionRegistry({
    getSettings: () => ({ version: 1, extensions: {} }),
    saveSettingsPatch: async () => {},
  })
  registry.register({
    manifest: { id: 'anilist', name: 'AniList', type: 'data', settings: [], account: { provider: 'anilist', kind: 'token' } },
    account: anilistAccount,
  })
  registry.register({
    manifest: { id: 'bangumi', name: 'Bangumi', type: 'data', settings: [], account: { provider: 'bangumi', kind: 'token' } },
    account: bangumiAccount,
  })
  registry.register({ manifest: { id: 'plain', name: 'Plain', type: 'data', settings: [] } })

  const providers = registry.accountProviders()
  check('providers listed, plain extension excluded', providers.length, 2)
  check('label comes from the provider module', providers[0]?.label, 'AniList')
  check('hint comes from the provider module', (providers[0]?.hint ?? '').includes('Personal Access Token'), true)
  check('link comes from the provider module', providers[0]?.link, 'https://anilist.co/settings/developer')
  check('extension id is attached', providers[0]?.extension, 'anilist')

  const anilist = registry.account('anilist')
  check('registry hands back verify()', typeof anilist.verify, 'function')
  check('a token provider has no start()', anilist.start, null)

  let unknown = ''
  try {
    registry.account('nope')
  } catch (error) {
    unknown = String(error?.message ?? error)
  }
  check('an unknown provider says so', unknown.includes('未知的账号来源'), true)

  let empty = ''
  try {
    await anilist.verify('')
  } catch (error) {
    empty = String(error?.message ?? error)
  }
  check('verify() rejects an empty token', empty, 'token 不能为空')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

let failed = 0
for (const item of results) {
  if (!item.ok) failed += 1
  const detail = item.ok ? '' : ` expected ${JSON.stringify(item.expected)} got ${JSON.stringify(item.actual)}`
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${detail}`)
}
console.log(failed === 0 ? 'all account-store checks passed' : `${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
