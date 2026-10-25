/**
 * What the AniCh 注册 endpoints actually answer, without creating an account.
 *
 * 注册要一步邮箱验证码，而验证码只发到真邮箱，所以这里只走两条不可能成功的路：
 *
 *  1. `/code` 用一个 RFC 2606 保留域名（`.invalid` 永远不会投递），看站点收不收这个请求。
 *  2. `/register` 把验证码填成 000000，看它在"验证码不对"这一关怎么答。
 *
 * 两条都不写库、不建号。真正的注册是用户在窗口里把收到的验证码填进去，代码路径
 * 和这里完全一样，只差 code 这一个参数。
 *
 *   node dev/probe-anich-register.mjs [base]
 */
const { sendCode, register, ANICH_HOSTS } = await import('../lib/anich.js')

const base = String(process.argv[2] ?? process.env.ANICH_BASE ?? ANICH_HOSTS[0]).trim()
const EMAIL = 'probe@example.invalid'

console.log(`base ${base}`)
console.log(`email ${EMAIL}（.invalid 是保留域名，不会真的投递）\n`)

let codeSent = false
try {
  const result = await sendCode({ base, email: EMAIL })
  codeSent = true
  console.log(`/code → 接受了：${result.message}`)
} catch (error) {
  console.log(`/code → 拒绝：${error?.message ?? error}`)
}

console.log(`\n/register（验证码 000000，不建号）`)
try {
  const result = await register({
    base,
    email: EMAIL,
    code: '000000',
    name: 'dsh-anime-probe',
    password: 'probe-not-a-real-password',
  })
  // register() 只在成功时返回，走到这里说明站点真建了号——那是不该发生的。
  console.log(`!!! /register 返回成功：${JSON.stringify(result).slice(0, 200)}`)
  process.exitCode = 2
} catch (error) {
  const message = String(error?.message ?? error)
  console.log(`/register → 拒绝：${message}`)
  const decoded = /验证码|校验|code|invalid/i.test(message)
  if (!decoded) {
    console.log('  （错误里没有出现验证码相关的词，看上面的原文判断站点怎么答的）')
  }
}

console.log(
  `\n结论：${codeSent ? '发码接口可达' : '发码接口没通过（可能是 base 不可达或站点要求别的参数）'}；` +
    '注册接口本身可达，剩下的只差用户邮箱收到的那个验证码。',
)
