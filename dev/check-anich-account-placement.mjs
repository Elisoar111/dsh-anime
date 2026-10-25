/**
 * Where does the AniCh account card live?
 *
 * The user asked for the registration form to sit inside the data-source
 * extension ("将注册页面写到数据源的插件里"), not in 设置 → 账号. That is a
 * wiring question with two halves, and this script checks both without a
 * browser:
 *
 *   host  — /accounts must report the `anich` provider as kind=password,
 *           scoped=true and owned by `anich-data` (the 索引 data source).
 *   page  — the client must not collapse that kind back to 'token' (the bug
 *           that kept the register form from ever rendering in a panel), must
 *           hide scoped providers from the accounts page, and must open the
 *           preferences dialog for an extension that has an account but no
 *           settings.
 *
 *   node dev/check-anich-account-placement.mjs [port]
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PORT = process.argv[2] || process.env.DSH_PORT || '40070'
const API = `http://127.0.0.1:${PORT}/dsh-anime/api`

let failures = 0
function check(label, ok, detail) {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// ---- host side ------------------------------------------------------------
const response = await fetch(`${API}/accounts`, { signal: AbortSignal.timeout(20_000) })
const payload = await response.json()
const providers = payload?.data?.providers ?? []
const anich = providers.find((item) => item?.id === 'anich') ?? null

check('宿主报告 anich provider', anich !== null)
if (anich !== null) {
  check('kind 是 password', anich.kind === 'password', anich.kind)
  check('scoped=true（不重复出现在设置 → 账号）', anich.scoped === true, String(anich.scoped))
  check('归属 anich-data（AniCh 索引数据源）', anich.extension === 'anich-data', anich.extension)
  check('带登录/注册说明', String(anich.hint ?? '').includes('注册'), String(anich.hint ?? '').slice(0, 24))
}
check('凭据仍然在（登录态没被搬动影响）', payload?.data?.accounts?.anich?.loggedIn === true)

const extensions = await (await fetch(`${API}/extensions`, { signal: AbortSignal.timeout(20_000) })).json()
const anichData = (extensions?.data?.items ?? []).find((item) => item?.id === 'anich-data') ?? null
const onlineAnich = (extensions?.data?.items ?? []).find((item) => item?.id === 'anich') ?? null
check('数据源声明 account=anich', anichData?.account === 'anich', String(anichData?.account))
check('在线源不再重复声明 account', onlineAnich?.account === '', String(onlineAnich?.account))

// ---- page side ------------------------------------------------------------
const client = readFileSync(join(ROOT, 'client.js'), 'utf8')

check(
  'prefs 面板不再把 password/oauth 折成 token',
  !client.includes("kind: hostProvider.kind === 'qr' ? 'qr' : 'token'"),
)
check(
  'prefs 面板透传 password',
  client.includes("hostProvider.kind === 'password' || hostProvider.kind === 'oauth' || hostProvider.kind === 'qr'"),
)
check(
  '设置 → 账号过滤 scoped provider',
  client.includes('.filter((host) => host?.scoped !== true)'),
)
check(
  '没有 settings 但声明了 account 也显示偏好按钮',
  client.includes("const hasPrefs = entry.settings.length > 0 || entry.account !== ''"),
)
check(
  '注册表单只在 kind=password 且未登录时出现',
  client.includes("!loggedIn && info.kind === 'password'"),
)

console.log('')
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exitCode = failures === 0 ? 0 : 1
