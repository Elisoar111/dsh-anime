/**
 * Schema test for the extension registry: choice / text / number / switch
 * coercion, `options` reaching the client, and the enabled gate on handlers.
 * Runs entirely in memory, so it never touches the user's settings.json —
 * `dev/test-extensions.mjs` covers the same ground through the real routes.
 */
import { createExtensionRegistry } from '../lib/extensions.js'

let store = { extensions: {} }
const registry = createExtensionRegistry({
  getSettings: () => store,
  saveSettingsPatch: async (patch) => {
    store = { ...store, ...patch }
    return store
  },
})

registry.register({
  manifest: {
    id: 'demo',
    name: 'Demo',
    type: 'online',
    version: '1.0.0',
    settings: [
      {
        key: 'quality',
        kind: 'choice',
        default: 80,
        label: '清晰度',
        options: [
          { value: 120, label: '4K' },
          { value: 80, label: '1080P+' },
          { value: 64, label: '720P' },
        ],
      },
      { key: 'note', kind: 'text', default: 'hello', label: 'Note' },
      { key: 'limit', kind: 'number', min: 1, max: 10, default: 5, label: 'Limit' },
      { key: 'on', kind: 'switch', default: true, label: 'On' },
    ],
  },
  handlers: {
    ping: async (args) => ({ echoed: args.value ?? null }),
  },
})

const failures = []
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} → ${JSON.stringify(actual)}`)
}

check('defaults', registry.values('demo'), { quality: 80, note: 'hello', limit: 5, on: true })

// Junk in settings.json must never reach the source: a quality outside the
// ladder falls back, and a non-boolean switch falls back to its default too
// (same rule as a number outside its range).
store = { extensions: { demo: { quality: 999, note: '', limit: 99, on: 'yes' } } }
check('coerced junk', registry.values('demo'), { quality: 80, note: 'hello', limit: 10, on: true })

await registry.saveSettings('demo', { quality: 64, note: 'x', limit: 3, on: false })
check('saved', registry.values('demo'), { quality: 64, note: 'x', limit: 3, on: false })

const listed = registry.list().find((entry) => entry.id === 'demo')
check(
  'list options',
  listed.settings.find((field) => field.key === 'quality').options,
  [
    { value: 120, label: '4K', labelEn: '4K' },
    { value: 80, label: '1080P+', labelEn: '1080P+' },
    { value: 64, label: '720P', labelEn: '720P' },
  ],
)

check('call while enabled', await registry.call('demo', 'ping', { value: 7 }), { echoed: 7 })

await registry.setEnabled('demo', false)
let gate = null
try {
  await registry.call('demo', 'ping', {})
} catch (error) {
  gate = String(error.message)
}
check('call while disabled throws', typeof gate === 'string' && gate.includes('停用'), true)

await registry.setEnabled('demo', true)
check('values survive the toggle', registry.values('demo'), { quality: 64, note: 'x', limit: 3, on: false })

if (failures.length > 0) {
  console.error(`\n${failures.length} failed`)
  for (const line of failures) console.error(` - ${line}`)
  process.exitCode = 1
} else {
  console.log('\nall extension-schema checks passed')
}
