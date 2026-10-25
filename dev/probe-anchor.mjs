import { readFileSync } from 'node:fs'

const source = readFileSync('client.js', 'utf8')
const anchor = `        { className: 'dshan-settings' },
        h(
          'div',
          { className: 'dshan-settings-head' },`
console.log('anchor hits:', source.split(anchor).length - 1)
console.log('class hits:', source.split("className: 'dshan-settings'").length - 1)
console.log('sections tagged:', source.split("data-group': group ?? 'other'").length - 1)
console.log('group state:', source.split("const [group, setGroup]").length - 1)
