/**
 * Load client.js the way the Harness does, to surface load-time errors that the
 * real app only shows as a missing panel.
 *
 *   node dev/load-client.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync('client.js', 'utf8')

const styleNode = { textContent: '', remove() {} }
const documentStub = {
  getElementById: () => null,
  createElement: () => styleNode,
  head: { appendChild() {} },
  body: { appendChild() {} },
  documentElement: { style: {} },
}

const React = {
  createElement: (...args) => ({ args }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  Component: function ComponentStub(props) {
    this.props = props
    this.state = {}
  },
  Fragment: 'fragment',
}

const store = new Map()
const sandbox = {
  React,
  window: {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    location: { href: 'dsh-app://app/' },
    fetch: () => Promise.reject(new Error('no network in the loader test')),
  },
  document: documentStub,
  localStorage: null,
  fetch: () => Promise.reject(new Error('no network in the loader test')),
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: () => {},
  navigator: { language: 'zh-CN' },
  AudioContext: function AudioContextStub() {},
  URLSearchParams,
}
sandbox.localStorage = sandbox.window.localStorage

let captured = null
sandbox.window.__ModuleLoader__ = {
  load(entry) {
    captured = entry
  },
}

const names = Object.keys(sandbox.window)
const body = source.replace(/^/, '')

const vm = await import('node:vm')
const context = vm.createContext({ ...sandbox, window: sandbox.window })

try {
  vm.runInContext(
    `(function(){ const window = this.window; const document = this.document; const localStorage = this.localStorage; const React = this.React; const fetch = this.fetch; const navigator = this.navigator; const AudioContext = this.AudioContext; const setTimeout = this.setTimeout; const clearTimeout = this.clearTimeout; const setInterval = this.setInterval; const clearInterval = this.clearInterval; const requestAnimationFrame = this.requestAnimationFrame; const cancelAnimationFrame = this.cancelAnimationFrame; const console = this.console; ${source} }).call(this)`,
    context,
    { filename: 'client.js' },
  )
} catch (error) {
  console.log('LOAD ERROR:', error?.name, error?.message)
  console.log(String(error?.stack ?? '').split('\n').slice(0, 6).join('\n'))
  process.exit(1)
}

if (captured === null) {
  console.log('no __ModuleLoader__.load call captured')
  process.exit(1)
}

console.log('module id:', captured.id)

const requireStub = (name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require(${name})`)
}

try {
  const exported = captured.factory(requireStub)
  console.log('factory ok; keys:', Object.keys(exported ?? {}).join(', '))

  // Now run apply() with a stub context: this is where slots get registered.
  const registered = []
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject: (deps, callback) => callback({}),
    slots: {
      inject: (name, callback) => callback(),
      register: (definition) => {
        registered.push(`${definition?.name}:${definition?.id ?? definition?.key ?? '?'}`)
        return () => {}
      },
      registerFactory: (definition) => {
        registered.push(`factory:${definition?.name ?? '?'}`)
        return () => {}
      },
    },
    locale: {
      register: () => {},
      bind: () => (key) => key,
      addLanguage: () => {},
    },
  }
  exported.apply(ctx)
  console.log('apply ok; slots:', registered.join(' | '))
} catch (error) {
  console.log('FACTORY/APPLY ERROR:', error?.name, error?.message)
  console.log(String(error?.stack ?? '').split('\n').slice(0, 8).join('\n'))
  process.exit(1)
}
