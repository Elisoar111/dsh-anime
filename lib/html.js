/**
 * A small HTML parser with a jsoup-shaped API, because scrapers should not be
 * regexes. jsoup itself is Java; the Node world usually reaches for cheerio or
 * jsdom, but this plugin ships as a single directory inside the host's profile
 * and cannot add dependencies (and the machine cannot reach npm). So this is
 * the useful subset, written to the same shape:
 *
 *   const doc = parseHtml(html)
 *   doc.select('a[href*="/detail/"]')      -> Element[]
 *   doc.select('.card .title')             -> Element[] (descendant chains)
 *   doc.select('#main, .poster')           -> Element[] (comma separated)
 *   el.attr('href')                        -> string | null
 *   el.text()                              -> collapsed, entity-decoded text
 *   el.html()                              -> inner markup as it was written
 *
 * Deliberate limits: no sibling combinators (`+`, `~`), no `:pseudo` classes, no
 * namespace handling, and malformed nesting is repaired the forgiving way
 * (a stray end tag is ignored, an unclosed element is closed by its ancestor).
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

/** Tags whose content is raw text: no markup inside, worth not tokenizing. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])

/**
 * Start tags that implicitly close the same element when it is still open —
 * the "forgiving" part of HTML parsing (`<li>a<li>b` is two siblings, not a
 * nest), which real pages rely on.
 */
const IMPLIED_CLOSERS = new Set(['li', 'p', 'option', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot'])

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  middot: '\u00b7', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
  laquo: '\u00ab', raquo: '\u00bb', ldquo: '\u201c', rdquo: '\u201d',
  lsquo: '\u2018', rsquo: '\u2019', times: '\u00d7', divide: '\u00f7',
  deg: '\u00b0', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
}

export function decodeEntities(text) {
  if (text.indexOf('&') < 0) return text
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? safeFromCode(code) : whole
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? safeFromCode(code) : whole
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? whole : named
  })
}

function safeFromCode(code) {
  if (code <= 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

class Element {
  constructor(tag, attrs = {}, parent = null) {
    this.tag = tag
    this.attrs = attrs
    this.children = []
    this.parent = parent
  }

  get className() {
    return this.attrs.class ?? ''
  }

  get id() {
    return this.attrs.id ?? ''
  }

  attr(name) {
    const value = this.attrs[String(name).toLowerCase()]
    return value === undefined ? null : value
  }

  hasAttr(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, String(name).toLowerCase())
  }

  /** Direct element children. */
  childrenElements() {
    return this.children.filter((child) => child instanceof Element)
  }

  /** Every descendant element, in document order. */
  descendants() {
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child instanceof Element) {
          out.push(child)
          walk(child)
        }
      }
    }
    walk(this)
    return out
  }

  select(selector) {
    return parseSelector(selector).flatMap((chain) => selectChain(this, chain))
  }

  selectOne(selector) {
    return this.select(selector)[0] ?? null
  }

  /** Visible-ish text: tags dropped, entities decoded, whitespace collapsed. */
  text() {
    const parts = []
    const walk = (node) => {
      for (const child of node.children) {
        if (child instanceof Element) {
          if (child.tag === 'br') parts.push(' ')
          else walk(child)
        } else {
          parts.push(child.text)
        }
      }
    }
    walk(this)
    return decodeEntities(parts.join(' ')).replace(/\s+/g, ' ').trim()
  }

  /** Inner markup, re-serialized from the parsed tree. */
  html() {
    return this.children.map(serialize).join('')
  }
}

function serialize(node) {
  if (node instanceof Element === false) return node.text
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${value}"`))
    .join('')
  if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`
}

/**
 * Read one tag's attributes starting right after its name. Returns the attrs and
 * the index of the `>` that ends the tag.
 */
function readAttributes(html, at) {
  const attrs = {}
  let index = at
  let selfClosing = false
  const length = html.length
  while (index < length) {
    const ch = html[index]
    if (ch === '>') {
      return { attrs, selfClosing, next: index + 1 }
    }
    if (ch === '/' && html[index + 1] === '>') {
      return { attrs, selfClosing: true, next: index + 2 }
    }
    if (/\s/.test(ch) || ch === '/') {
      index += 1
      continue
    }
    // Attribute name.
    const nameStart = index
    while (index < length && /[^\s=/>]/.test(html[index])) index += 1
    const name = html.slice(nameStart, index).toLowerCase()
    while (index < length && /\s/.test(html[index])) index += 1
    let value = ''
    if (html[index] === '=') {
      index += 1
      while (index < length && /\s/.test(html[index])) index += 1
      const quote = html[index]
      if (quote === '"' || quote === "'") {
        index += 1
        const valueStart = index
        while (index < length && html[index] !== quote) index += 1
        value = html.slice(valueStart, index)
        index += 1
      } else {
        const valueStart = index
        while (index < length && /[^\s>]/.test(html[index])) index += 1
        value = html.slice(valueStart, index)
      }
    }
    if (name !== '') attrs[name] = decodeEntities(value)
  }
  return { attrs, selfClosing, next: length }
}

/** Parse a document (or fragment) and hand back its root element. */
export function parseHtml(html) {
  const source = String(html ?? '')
  const root = new Element('#root')
  const stack = [root]
  const length = source.length
  let index = 0

  const pushText = (raw) => {
    if (raw === '') return
    const parent = stack[stack.length - 1]
    const last = parent.children[parent.children.length - 1]
    if (last !== undefined && last instanceof Element === false) last.text += raw
    else parent.children.push({ text: raw })
  }

  while (index < length) {
    const lt = source.indexOf('<', index)
    if (lt < 0) {
      pushText(source.slice(index))
      break
    }
    if (lt > index) pushText(source.slice(index, lt))

    // Comments and doctypes are dropped, not kept as nodes.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      index = end < 0 ? length : end + 3
      continue
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt)
      index = end < 0 ? length : end + 1
      continue
    }
    // End tag.
    if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt)
      if (end < 0) {
        index = length
        break
      }
      const name = source.slice(lt + 2, end).trim().toLowerCase()
      for (let depth = stack.length - 1; depth >= 1; depth -= 1) {
        if (stack[depth].tag === name) {
          stack.length = depth
          break
        }
      }
      index = end + 1
      continue
    }
    // Start tag.
    const nameStart = lt + 1
    let cursor = nameStart
    while (cursor < length && /[^\s/>]/.test(source[cursor])) cursor += 1
    const name = source.slice(nameStart, cursor).toLowerCase()
    if (name === '') {
      // A stray `<` that is not a tag: keep it as text.
      pushText('<')
      index = lt + 1
      continue
    }
    const { attrs, selfClosing, next } = readAttributes(source, cursor)
    // A repeated <li>/<p>/<tr>/… closes the still-open one first.
    if (IMPLIED_CLOSERS.has(name) && stack.length > 1 && stack[stack.length - 1].tag === name) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    const element = new Element(name, attrs, parent)
    parent.children.push(element)
    index = next

    if (RAW_TEXT_TAGS.has(name) && selfClosing === false) {
      const closer = source.toLowerCase().indexOf(`</${name}`, index)
      const rawEnd = closer < 0 ? length : closer
      const raw = source.slice(index, rawEnd)
      if (raw !== '') element.children.push({ text: raw })
      const gt = closer < 0 ? length : source.indexOf('>', closer)
      index = gt < 0 ? length : gt + 1
      continue
    }
    if (selfClosing === false && VOID_TAGS.has(name) === false) stack.push(element)
  }

  return root
}

/* ------------------------------------------------------------------ selectors */

function parseSelector(selector) {
  return String(selector)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => part.split(/\s+/).map(parseCompound))
}

function parseCompound(token) {
  const compound = { tag: null, classes: [], id: null, attrs: [] }
  let rest = token
  const tagMatch = /^([a-zA-Z][a-zA-Z0-9-]*|\*)/.exec(rest)
  if (tagMatch !== null) {
    compound.tag = tagMatch[1] === '*' ? null : tagMatch[1].toLowerCase()
    rest = rest.slice(tagMatch[0].length)
  }
  while (rest !== '') {
    if (rest[0] === '.') {
      const match = /^\.([A-Za-z0-9_-]+)/.exec(rest)
      if (match === null) break
      compound.classes.push(match[1])
      rest = rest.slice(match[0].length)
      continue
    }
    if (rest[0] === '#') {
      const match = /^#([A-Za-z0-9_-]+)/.exec(rest)
      if (match === null) break
      compound.id = match[1]
      rest = rest.slice(match[0].length)
      continue
    }
    if (rest[0] === '[') {
      const match = /^\[([A-Za-z0-9_:-]+)(?:([~^$*|]?=)"?([^"\]]*)"?)?\]/.exec(rest)
      if (match === null) break
      compound.attrs.push({ name: match[1].toLowerCase(), op: match[2] ?? null, value: match[3] ?? '' })
      rest = rest.slice(match[0].length)
      continue
    }
    break
  }
  return compound
}

function matchesCompound(element, compound) {
  if (compound.tag !== null && element.tag !== compound.tag) return false
  if (compound.id !== null && element.id !== compound.id) return false
  if (compound.classes.length > 0) {
    const classes = element.className.split(/\s+/)
    for (const name of compound.classes) if (classes.includes(name) === false) return false
  }
  for (const { name, op, value } of compound.attrs) {
    const actual = element.attr(name)
    if (actual === null) return false
    if (op === null) continue
    if (op === '=' && actual !== value) return false
    if (op === '*=' && actual.includes(value) === false) return false
    if (op === '^=' && actual.startsWith(value) === false) return false
    if (op === '$=' && actual.endsWith(value) === false) return false
    if (op === '~=' && actual.split(/\s+/).includes(value) === false) return false
    if (op === '|=' && actual !== value && actual.startsWith(`${value}-`) === false) return false
  }
  return true
}

/** Does `element` have ancestors matching compounds[0..n-1], in order? */
function matchesChain(element, chain, upto) {
  let need = upto - 1
  let node = element.parent
  while (node !== null && need >= 0) {
    if (node instanceof Element && matchesCompound(node, chain[need])) need -= 1
    node = node.parent
  }
  return need < 0
}

function selectChain(root, chain) {
  const last = chain[chain.length - 1]
  const pool = root instanceof Element ? [root, ...root.descendants()] : root.descendants()
  return pool.filter(
    (element) =>
      (root instanceof Element ? element !== root || chain.length > 1 : true) &&
      matchesCompound(element, last) &&
      (chain.length === 1 || matchesChain(element, chain, chain.length - 1)),
  )
}

/** Convenience: parse and select in one call. */
export function selectHtml(html, selector) {
  return parseHtml(html).select(selector)
}
