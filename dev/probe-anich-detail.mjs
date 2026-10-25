/**
 * What `/bangumi/detail` and `/bangumi/episodes` actually hand back, so the
 * detail page and the follow card can be wired to fields that exist.
 *
 *   DSH_PORT=40070 node dev/probe-anich-detail.mjs [animeId]
 *
 * The base URL comes from the same host default the plugin uses; a token is
 * optional (AniCh answers anonymous reads, it only needs one for playback).
 */
import { detail, episodes } from '../lib/anich.js'

const BASE = process.env.ANICH_BASE ?? 'https://ani.emmmm.eu.org'
const TOKEN = process.env.ANICH_TOKEN ?? ''
const id = String(process.argv[2] ?? '39802')

const raw = await detail({ base: BASE, token: TOKEN, id })
console.log('detail keys:', Object.keys(raw).sort().join(','))
console.log(JSON.stringify(raw, null, 1).slice(0, 1200))

const list = await episodes({ base: BASE, token: TOKEN, id })
console.log(`\nepisodes: ${list.length}`)
console.log(JSON.stringify(list.slice(0, 3)))
