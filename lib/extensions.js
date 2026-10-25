/**
 * A tiny extension system for the anime plugin.
 *
 * An extension is a manifest plus a set of handlers. Three kinds exist:
 *   data    — metadata (AniList / Bangumi / Animeko)
 *   torrent — torrent search (AniBT / AnimeTosho)
 *   online  — streamable episodes (bilibili)
 *
 * Everything the UI needs is derived from the manifest, so the sources page can
 * render cards, an on/off switch and a preferences dialog without knowing which
 * extension it is looking at. Settings live in settings.json under `extensions`,
 * validated here against the manifest schema.
 */

export const EXTENSION_TYPES = ['data', 'torrent', 'online']

export const TYPE_LABELS = {
  data: { zh: '数据源', en: 'Data source' },
  torrent: { zh: '种子流', en: 'Torrent stream' },
  online: { zh: '在线流', en: 'Online stream' },
}

const DEFAULT_TIMEOUT = 25000

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  if (min !== undefined && number < min) return min
  if (max !== undefined && number > max) return max
  return Math.round(number)
}

function withTimeout(promise, ms, label) {
  let timer = null
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时（${Math.round(ms / 1000)}s）`)), ms)
  })
  return Promise.race([promise, limit]).finally(() => {
    if (timer !== null) clearTimeout(timer)
  })
}

export function createExtensionRegistry({ getSettings, saveSettingsPatch }) {
  /** id -> { manifest, handlers } */
  const extensions = new Map()

  function register({ manifest, handlers, account }) {
    if (!manifest?.id) throw new Error('extension needs an id')
    if (!EXTENSION_TYPES.includes(manifest.type)) {
      throw new Error(`extension ${manifest.id}: unknown type ${manifest.type}`)
    }
    extensions.set(manifest.id, { manifest, handlers: handlers ?? {}, account: account ?? null })
  }

  /**
   * How a manifest describes its account, or null when it has none.
   *
   * `account: 'bilibili'` (the old shorthand) still works; the object form adds
   * the presentation the login card needs: label, hint, kind and a signup link.
   */
  function accountOf(manifest) {
    const spec = manifest?.account
    if (spec === null || spec === undefined) return null
    if (typeof spec === 'string') {
      return { id: spec, label: '', hint: '', kind: '', link: '', placeholder: '', scoped: false }
    }
    const id = String(spec.provider ?? spec.id ?? manifest.id ?? '').trim()
    if (id === '') return null
    return {
      id,
      label: String(spec.label ?? ''),
      hint: String(spec.hint ?? ''),
      kind:
        spec.kind === 'qr' || spec.kind === 'oauth' || spec.kind === 'token' || spec.kind === 'password'
          ? spec.kind
          : '',
      link: String(spec.link ?? ''),
      placeholder: String(spec.placeholder ?? ''),
      scoped: spec.scoped === true,
    }
  }

  /**
   * Buttons an extension can contribute to the page.
   *
   * A source is a data provider first: the player stays the page's business and
   * all a source adds here is a label plus what pressing it does. `open` hands
   * the user to the site itself (the extension's own manual-match page), `call`
   * runs a handler the extension registered.
   */
  function actionsOf(manifest) {
    const declared = Array.isArray(manifest?.actions) ? manifest.actions : []
    const items = []
    for (const action of declared) {
      const id = String(action?.id ?? '').trim()
      if (id === '') continue
      const url = String(action?.url ?? '').trim()
      const handler = String(action?.handler ?? '').trim()
      const kind = action?.kind === 'call' || (action?.kind !== 'open' && handler !== '' && url === '') ? 'call' : 'open'
      if (kind === 'open' && url === '') continue
      if (kind === 'call' && handler === '') continue
      items.push({
        id,
        kind,
        url,
        handler,
        icon: String(action?.icon ?? ''),
        label: String(action?.label ?? id),
        labelEn: String(action?.labelEn ?? action?.label ?? id),
        hint: String(action?.hint ?? ''),
      })
    }
    return items
  }

  /**
   * Presentation of one account, manifest first and the provider implementation
   * second: a source can declare `account: { provider: 'anilist' }` and let its
   * module carry the label, hint and link the login card shows.
   */
  function accountSpec(entry) {
    const spec = accountOf(entry.manifest)
    if (spec === null) return null
    const impl = entry.account !== null && typeof entry.account === 'object' ? entry.account : {}
    const pick = (key) => {
      const fromManifest = spec[key]
      if (typeof fromManifest === 'string' && fromManifest !== '') return fromManifest
      const fromImpl = impl[key]
      return typeof fromImpl === 'string' ? fromImpl : ''
    }
    return {
      id: spec.id,
      label: pick('label') || entry.manifest.name || spec.id,
      hint: pick('hint'),
      kind:
        spec.kind !== ''
          ? spec.kind
          : impl.kind === 'qr' || impl.kind === 'oauth' || impl.kind === 'password'
            ? impl.kind
            : 'token',
      link: pick('link'),
      placeholder: pick('placeholder'),
      /**
       * `scoped: true` means "this account is only edited inside the extension's
       * own panel, not in 设置 → 账号". AniCh is the case that asked for it: its
       * login *and* registration belong next to the data source it unlocks.
       */
      scoped: spec.scoped === true || impl.scoped === true,
    }
  }

  function raw(enabledSettings) {
    const store = enabledSettings?.extensions
    return store !== null && typeof store === 'object' ? store : {}
  }

  function fieldsOf(manifest) {
    return Array.isArray(manifest.settings) ? manifest.settings : []
  }

  /** Options of a `choice` field, normalised to { value, label, labelEn }. */
  function optionsOf(field) {
    const raw = Array.isArray(field.options) ? field.options : []
    return raw
      .map((option) =>
        option !== null && typeof option === 'object'
          ? {
              value: option.value,
              label: String(option.label ?? option.value ?? ''),
              labelEn: String(option.labelEn ?? option.label ?? option.value ?? ''),
            }
          : { value: option, label: String(option), labelEn: String(option) },
      )
      .filter((option) => option.value !== undefined && option.value !== null)
  }

  /**
   * One stored value, coerced by the field kind. `choice` accepts only a value
   * the manifest declares, so a stale settings.json cannot ask bilibili for a
   * quality its own ladder no longer offers.
   */
  function coerceField(field, stored) {
    if (field.kind === 'switch') {
      return typeof stored === 'boolean' ? stored : field.default === true
    }
    if (field.kind === 'choice') {
      const options = optionsOf(field)
      const match = options.find((option) => String(option.value) === String(stored))
      if (match !== undefined) return match.value
      const fallback = options.find((option) => String(option.value) === String(field.default))
      return fallback === undefined ? (options[0]?.value ?? null) : fallback.value
    }
    if (field.kind === 'text') {
      return typeof stored === 'string' && stored !== '' ? stored : String(field.default ?? '')
    }
    return clampNumber(stored, field.min, field.max, field.default)
  }

  function valuesOf(manifest) {
    const stored = raw(getSettings())[manifest.id]
    const source = stored !== null && typeof stored === 'object' ? stored : {}
    const values = {}
    for (const field of fieldsOf(manifest)) {
      values[field.key] = coerceField(field, source[field.key])
    }
    return values
  }

  function enabledOf(target) {
    const manifest = typeof target === 'string' ? one(target).manifest : target
    const stored = raw(getSettings())[manifest.id]
    // A source that ships switched off only stays off until the user flips it.
    if (stored === null || typeof stored !== 'object') return manifest.defaultEnabled !== false
    return stored.enabled !== false
  }

  /** Throws a page-readable error when an extension is switched off. */
  function assertEnabled(id) {
    const { manifest } = one(id)
    if (!enabledOf(manifest)) {
      throw new Error(`${manifest.name} 已在「片源」里停用，先打开再用`)
    }
    return true
  }

  function one(id) {
    const entry = extensions.get(id)
    if (entry === undefined) throw new Error(`未知的扩展: ${id}`)
    return entry
  }

  /** The shape the client renders: manifest + schema + current values. */
  function list() {
    const items = []
    for (const { manifest } of extensions.values()) {
      items.push({
        id: manifest.id,
        name: manifest.name,
        type: manifest.type,
        version: manifest.version ?? '',
        author: manifest.author ?? '',
        description: manifest.description ?? '',
        lang: manifest.lang ?? 'multi',
        icon: manifest.icon ?? '',
        website: manifest.website ?? '',
        builtin: manifest.builtin !== false,
        /** Account provider id this extension owns ('' when it has none). */
        account: accountOf(manifest)?.id ?? '',
        actions: actionsOf(manifest),
        settings: fieldsOf(manifest).map((field) => ({
          key: field.key,
          kind: field.kind,
          min: field.min,
          max: field.max,
          default: field.default,
          unit: field.unit ?? '',
          placeholder: field.placeholder ?? '',
          options: field.kind === 'choice' ? optionsOf(field) : undefined,
          label: field.label ?? field.key,
          labelEn: field.labelEn ?? field.label ?? field.key,
          hint: field.hint ?? '',
          hintEn: field.hintEn ?? field.hint ?? '',
        })),
        values: valuesOf(manifest),
        enabled: enabledOf(manifest),
      })
    }
    return items
  }

  function ofType(type) {
    const items = []
    for (const entry of extensions.values()) {
      if (entry.manifest.type === type) items.push(entry)
    }
    return items
  }

  async function saveSettings(manifestOrId, values) {
    const id = typeof manifestOrId === 'string' ? manifestOrId : manifestOrId.id
    const { manifest } = one(id)
    const patchValues = {}
    for (const field of fieldsOf(manifest)) {
      if (values?.[field.key] === undefined) continue
      patchValues[field.key] = coerceField(field, values[field.key])
    }
    const current = raw(getSettings())[id] ?? {}
    // 保存设置时把「是否启用」一起落定：否则一条默认关闭的源，用户只是填了个
    // 镜像地址，存下来的对象没有 enabled 字段，enabledOf 就把它当成开着——
    // 新用户默认全关的规则会在他第一次改设置时被悄悄推翻。
    const enabled = typeof current.enabled === 'boolean' ? current.enabled : manifest.defaultEnabled !== false
    await saveSettingsPatch({
      extensions: {
        ...raw(getSettings()),
        [id]: { ...current, ...patchValues, enabled },
      },
    })
    return valuesOf(manifest)
  }

  async function setEnabled(manifestOrId, enabled) {
    const id = typeof manifestOrId === 'string' ? manifestOrId : manifestOrId.id
    one(id)
    const current = raw(getSettings())[id] ?? {}
    await saveSettingsPatch({
      extensions: { ...raw(getSettings()), [id]: { ...current, enabled: enabled === true } },
    })
    return enabled === true
  }

  /** Handlers of one extension, or a clear error when it is switched off. */
  function handler(id, name) {
    const { manifest, handlers } = one(id)
    if (!enabledOf(manifest)) throw new Error(`${manifest.name} 已停用，先在「片源」里打开`)
    const fn = handlers[name]
    if (typeof fn !== 'function') throw new Error(`${manifest.name} 不支持 ${name}`)
    return { manifest, settings: valuesOf(manifest), fn }
  }

  /** Run one handler of one extension with its own settings + timeout. */
  async function call(id, name, args) {
    const { manifest, settings, fn } = handler(id, name)
    return withTimeout(Promise.resolve(fn(args ?? {}, settings)), manifest.timeoutMs ?? DEFAULT_TIMEOUT, manifest.name)
  }

  /**
   * Press one of the buttons an extension declared in `manifest.actions`.
   *
   * Returns `{ kind: 'open', url }` for a link the page should open, or
   * `{ kind: 'call', value }` with whatever the handler produced. Deliberately
   * small: the page keeps owning navigation and playback, this only resolves
   * what the button means.
   */
  async function runAction(id, actionId, args) {
    const entry = one(id)
    const action = actionsOf(entry.manifest).find((item) => item.id === actionId)
    if (action === undefined) throw new Error(`${entry.manifest.name} 没有这个按钮: ${actionId}`)
    if (action.kind === 'open') return { kind: 'open', url: action.url }
    const { manifest, settings, fn } = handler(id, action.handler)
    const value = await withTimeout(
      Promise.resolve(fn(args ?? {}, settings)),
      manifest.timeoutMs ?? DEFAULT_TIMEOUT,
      manifest.name,
    )
    return { kind: 'call', value }
  }

  /**
   * Ask every enabled extension of a type, in registration order, until one of
   * them produces something — used by torrent search so a dead source does not
   * hide a working one.
   */
  async function searchAll(type, name, args, perExtension) {
    const results = []
    const notes = []
    for (const { manifest } of ofType(type)) {
      if (!enabledOf(manifest)) continue
      try {
        const settings = valuesOf(manifest)
        const value = await withTimeout(
          Promise.resolve(extensions.get(manifest.id).handlers[name](args, settings)),
          manifest.timeoutMs ?? DEFAULT_TIMEOUT,
          manifest.name,
        )
        const items = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
        const sized =
          typeof perExtension === 'function' ? perExtension(manifest.id, items, settings) : items
        results.push({ id: manifest.id, name: manifest.name, items: sized })
        if (sized.length === 0) notes.push(`${manifest.name} 没有结果`)
      } catch (error) {
        notes.push(`${manifest.name} 失败: ${error?.message ?? error}`)
      }
    }
    return { results, notes }
  }

  /** Current settings of one extension by id (no enabled check). */
  function values(id) {
    return valuesOf(one(id).manifest)
  }

  /**
   * Every account a registered extension owns, in registration order.
   *
   * Deliberately not gated on `enabled`: you can log in before switching a
   * source on, and the login card has to exist to offer that.
   */
  function accountProviders() {
    const items = []
    const seen = new Set()
    for (const entry of extensions.values()) {
      const spec = accountSpec(entry)
      if (spec === null || seen.has(spec.id)) continue
      seen.add(spec.id)
      items.push({ ...spec, extension: entry.manifest.id, name: entry.manifest.name })
    }
    // A scanned QR is the fastest way in, so QR providers lead the settings page.
    return items.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'qr' ? -1 : 1
      return left.id.localeCompare(right.id)
    })
  }

  /** One account provider by id, with the handlers its extension supplied. */
  function account(provider) {
    const id = String(provider ?? '').trim()
    if (id === '') throw new Error('缺少账号来源')
    for (const entry of extensions.values()) {
      const spec = accountSpec(entry)
      if (spec === null || spec.id !== id) continue
      const impl = entry.account
      if (impl === null || typeof impl !== 'object') {
        throw new Error(`${entry.manifest.name} 没有提供账号登录`)
      }
      const pick = (name) => (typeof impl[name] === 'function' ? impl[name] : null)
      return {
        ...spec,
        extension: entry.manifest.id,
        manifest: entry.manifest,
        start: pick('start'),
        poll: pick('poll'),
        verify: pick('verify'),
        // 密码型账号（AniCh）：登录、注册、发验证码都由扩展自己实现。
        login: pick('login'),
        register: pick('register'),
        sendCode: pick('sendCode'),
        profile: pick('profile'),
      }
    }
    throw new Error(`未知的账号来源: ${id}`)
  }

  return {
    register,
    list,
    ofType,
    valuesOf,
    values,
    enabledOf,
    assertEnabled,
    saveSettings,
    setEnabled,
    handler,
    call,
    runAction,
    searchAll,
    accountProviders,
    account,
  }
}
