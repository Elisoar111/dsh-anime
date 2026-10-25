// Counts files per top-level folder in a GitHub tree dump whose JSON was printed
// with every quote/slash escaped (\"path\"\: \"lib\/features\/...\").
const fs = require('node:fs')
const raw = fs.readFileSync(process.argv[2], 'utf8')
const text = raw.replace(/\\+/g, (match) => (match.length % 2 === 1 ? '' : '\\'))
const files = [
  ...text.matchAll(/"path"\s*:\s*"((?:[^"\\\n]|\\.)+)"/g),
].map((m) => m[1].replace(/\\/g, ''))
const tops = new Map()
for (const file of files) {
  const key = file.split('/').slice(0, 2).join('/')
  tops.set(key, (tops.get(key) ?? 0) + 1)
}
console.log('files', files.length)
console.log(
  [...tops.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, count]) => `${count} ${key}`)
    .join('\n'),
)
const wanted = process.argv[3]
if (wanted) {
  const re = new RegExp(wanted, 'i')
  const hits = files.filter((f) => re.test(f))
  console.log(`--- matches ${hits.length}`)
  console.log(hits.join('\n'))
}
