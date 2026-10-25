import fs from 'node:fs'

const text = fs.readFileSync('assets/vendor/anime4k-webgpu/lib/index.js', 'utf8')
const needles = ['requestAnimationFrame', 'requestVideoFrameCallback', 'requestAdapter', 'configure(', 'destroy(']
for (const needle of needles) {
  let at = 0
  let seen = 0
  while (seen < 2) {
    at = text.indexOf(needle, at)
    if (at === -1) break
    console.log(`--- ${needle} @${at}`)
    console.log(text.slice(Math.max(0, at - 300), at + 300))
    at += needle.length
    seen += 1
  }
}
