/**
 * bilibili WBI signing.
 *
 * A handful of endpoints (`x/player/wbi/v2`, `x/space/wbi/...`, search) refuse
 * plain cookie calls and want `w_rid` + `wts` signed with a mixin key derived
 * from the nav response. The subtitles of user uploads — including the
 * machine-generated `ai-zh` track — sit behind that endpoint, so this module
 * exists rather than living inline in the bilibili factory.
 */
import { createHash } from 'node:crypto'

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39,
  12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63,
  57, 62, 11, 36, 20, 34, 44, 52,
]

const md5 = (text) => createHash('md5').update(text).digest('hex')

function keyFromUrl(url) {
  const name = String(url ?? '').split('/').pop() ?? ''
  return name.split('.')[0] ?? ''
}

/** Mixin key = the two nav keys shuffled through the fixed table, first 32 chars. */
export function mixinKey(imgUrl, subUrl) {
  const raw = `${keyFromUrl(imgUrl)}${keyFromUrl(subUrl)}`
  if (raw.length < 64) return ''
  let key = ''
  for (const index of MIXIN_KEY_ENC_TAB) key += raw[index] ?? ''
  return key.slice(0, 32)
}

const encodeValue = (value) =>
  String(value).replace(/[!'()*]/g, '')

/** Sign `params` in place-safe fashion; returns the query string to append. */
export function signQuery(params, mixin, timestamp = Math.floor(Date.now() / 1000)) {
  const all = { ...params, wts: timestamp }
  const query = Object.keys(all)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(encodeValue(all[key]))}`)
    .join('&')
  const wRid = md5(query + mixin)
  return `${query}&w_rid=${wRid}`
}
