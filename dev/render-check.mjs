/**
 * Structural render check for the client half, with no browser involved.
 *
 * React is replaced by a tiny createElement that returns plain trees, so the
 * components can be walked here; hooks are inert. That is enough to prove the
 * page mounts, the source switch is in the header, and the animeko branch of
 * every tab renders without throwing.
 *
 *   node dev/render-check.mjs [anilist|bangumi|animeko]
 */
const source = process.argv[2] ?? 'anilist'
const tab = process.argv[3] ?? 'season'

class FakeComponent {
  constructor(props) {
    this.props = props ?? {}
    this.state = {}
  }

  setState(next) {
    const patch = typeof next === 'function' ? next(this.state) : next
    this.state = { ...this.state, ...(patch ?? {}) }
  }
}

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useState: (init) => {
    let value = typeof init === 'function' ? init() : init
    // Panel's own tab state starts as 'season'; let the caller pick another.
    if (value === 'season') value = tab
    return [value, () => {}]
  },
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  Fragment: 'fragment',
  Component: FakeComponent,
}

const store = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  },
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, textContent: '' }),
  head: { appendChild() {} },
  querySelector: () => null,
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
}
store.set('dsh-anime:source:v1', source)

let module_ = null
globalThis.window.__ModuleLoader__ = { load: (mod) => { module_ = mod } }
await import('../client.js')

const api = module_.factory((id) => {
  if (id === 'react') return fakeReact
  throw new Error(`unexpected require(${id})`)
})

let panel = null
const ctx = {
  effect(fn) { fn(); return () => {} },
  locale: {
    register() {},
    bind: () => () => undefined,
  },
  slots: {
    register(options, factory) {
      if (options?.name === 'main') panel = factory()
      return () => {}
    },
  },
}

api.apply(ctx)
if (panel === null) throw new Error('the main panel was not registered')

const flow = []
function walk(node, depth = 0) {
  if (node === null || node === undefined || node === false || node === true) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, depth)
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    flow.push(String(node))
    return
  }
  if (typeof node === 'function') {
    walk(node({}), depth)
    return
  }
  if (typeof node.type === 'function') {
    const props = node.props ?? {}
    const proto = node.type.prototype
    if (proto !== undefined && typeof proto.render === 'function') {
      const instance = new node.type(props)
      walk(instance.render(), depth)
      return
    }
    walk(node.type(props), depth)
    return
  }
  if (typeof node.type === 'string') {
    const kids = node.props?.children
    if (Array.isArray(kids)) for (const kid of kids) walk(kid, depth + 1)
    else if (kids !== undefined) walk(kids, depth + 1)
    return
  }
  if (node.type === 'fragment') {
    for (const kid of node.props?.children ?? []) walk(kid, depth)
  }
}

// Let stubbed fetches settle, then render again: settings arrives in an effect.
await new Promise((resolve) => setTimeout(resolve, 30))
flow.length = 0
walk(panel)
const text = flow.join(' ')
const checks = [
  ['header renders the switch', /AniList/.test(text) && /Bangumi/.test(text) && /Animeko/.test(text)],
  ['tabs render', /本季新番/.test(text) && /放送表/.test(text) && /搜索/.test(text) && /片源/.test(text)],
  ['no raw react element leaked', !/\[object Object\]/.test(text)],
]
console.log(`source=${source} tab=${tab} — rendered ${flow.length} text nodes`)
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
console.log('\nfirst 320 chars:\n' + text.slice(0, 320))
if (checks.some(([, ok]) => !ok)) process.exitCode = 1
