#!/usr/bin/env node
/**
 * Writes `.br` and `.gz` sidecars next to the two shipped shader bundles.
 *
 * The Anime4K packs are 3.5 MB and 9.4 MB of minified JS; the host serves them
 * straight off disk, so the browser was downloading them uncompressed and the
 * panel sat on "reading shader" for seconds. Brotli takes them to 770 KB and
 * 1.43 MB (4.5x / 6.6x), and `serveVendorFile` picks the sidecar when the
 * request advertises `br`.
 *
 * Re-run this after replacing a bundle (`dev/vendor-anime4k-webgl.mjs`).
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const fs = require('node:fs')
const zlib = require('node:zlib')

const FILES = [
  'assets/vendor/anime4k-webgpu/lib/index.js',
  'assets/vendor/anime4k.js/anime4k.js',
]

for (const file of FILES) {
  const bytes = fs.readFileSync(file)
  const brotli = zlib.brotliCompressSync(bytes, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  })
  const gzip = zlib.gzipSync(bytes, { level: 9 })
  fs.writeFileSync(`${file}.br`, brotli)
  fs.writeFileSync(`${file}.gz`, gzip)
  console.log(
    `${file} raw=${bytes.length} br=${brotli.length} gz=${gzip.length} (${(bytes.length / brotli.length).toFixed(1)}x)`,
  )
}
