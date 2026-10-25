/**
 * AniList account provider.
 *
 * AniList has no QR login: you create a Personal Access Token in the developer
 * settings and paste it. Verifying it is one GraphQL query for `Viewer`, which
 * doubles as the display name and avatar for the settings page.
 */
import { httpJson } from './accounts.js'

const ENDPOINT = 'https://graphql.anilist.co'
const UA = 'DshAnime/1.0 (DeepSeek Harness plugin; +https://local.invalid/dsh-anime)'

function text(value, limit = 4096) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

async function verify(token) {
  const value = text(token)
  if (value === '') throw new Error('token 不能为空')
  const { status, payload } = await httpJson(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${value}`,
      'user-agent': UA,
    },
    body: JSON.stringify({ query: 'query { Viewer { id name avatar { medium } } }' }),
  })
  const viewer = payload?.data?.Viewer ?? null
  if (viewer === null) {
    const message = Array.isArray(payload?.errors) ? payload.errors[0]?.message : null
    if (message !== null && message !== undefined) throw new Error(`AniList: ${message}`)
    throw new Error(status >= 400 ? `AniList 拒绝了这个 token（HTTP ${status}）` : 'AniList 拒绝了这个 token')
  }
  return {
    secret: value,
    fields: {
      uid: Number(viewer.id) || null,
      name: text(viewer.name, 120),
      avatar: text(viewer.avatar?.medium, 512),
    },
    savedAt: Date.now(),
  }
}

export const anilistAccount = {
  provider: 'anilist',
  label: 'AniList',
  hint: '在 AniList → Settings → Developer → Create New Client 拿到 Personal Access Token。',
  kind: 'token',
  link: 'https://anilist.co/settings/developer',
  placeholder: '粘贴 Personal Access Token',
  verify,
}
