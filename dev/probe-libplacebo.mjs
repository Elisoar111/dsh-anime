import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(tmpdir(), 'dsh-a4k')
mkdirSync(dir, { recursive: true })
const src = 'D:/新建文件夹 (2)/dsh-anime/assets/anime4k/Anime4K_Clamp_Highlights.glsl'
const dst = join(dir, 'Anime4K_Clamp_Highlights.glsl')
copyFileSync(src, dst)

const plain = dst.replace(/\\/g, '/')
const escaped = plain.replace(/:/g, '\\:')
console.log('plain  :', plain)
console.log('escaped:', escaped)
console.log('quoted :', `'${plain}'`)

for (const [name, value] of [['escaped', escaped], ['quoted', `'${plain}'`]]) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24:duration=1',
    '-vf', `libplacebo=custom_shader_path=${value}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-y', `/tmp/lp-${name}.mp4`,
  ], { encoding: 'utf8' })
  console.log(name, 'exit', r.status, (r.stderr || '').split('\n').filter(Boolean).slice(-1).join(''))
}
