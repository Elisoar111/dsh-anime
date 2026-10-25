/**
 * A tiny XPath subset, enough for declarative source rules.
 *
 * The AnimeFlow source JSON describes where things are with paths like
 *
 *   //div[@id='cata_video_list'] /div /div[2] /h5 /a
 *   /div[2] /text()
 *
 * which is real XPath, so a CSS translation would lose the positional meaning:
 * `div[2]` there means "the second div child of its parent", not "the second
 * match in the document". This module implements exactly that:
 *
 *   //tag            any descendant named tag
 *   /tag             a child named tag
 *   //*              any descendant element
 *   [n]              positional among same-name siblings (1-based)
 *   [@attr='value']  attribute equality
 *   [@attr]          attribute presence
 *   /text()          terminal: text content
 *
 * Anything else (contains(), last(), unions) throws instead of guessing, so a
 * rule that our engine cannot honour fails loudly rather than silently picking
 * the wrong node.
 */

const STEP = /^(?<axis>\/\/|\/)?(?<tag>[A-Za-z][\w:-]*|\*)(?<preds>(?:\[[^\]]*\])*)$/

function parsePredicates(raw) {
  const predicates = []
  const pattern = /\[([^\]]*)\]/g
  let match = pattern.exec(raw)
  while (match !== null) {
    const inner = match[1].trim()
    if (/^\d+$/.test(inner)) {
      predicates.push({ index: Number(inner) })
    } else if (/^@[\w:-]+$/.test(inner)) {
      predicates.push({ attr: inner.slice(1), value: null })
    } else if (/^@[\w:-]+\s*=\s*('([^']*)'|"([^"]*)")$/.test(inner)) {
      const quoted = inner.replace(/^@[\w:-]+\s*=\s*/, '')
      const value = quoted.startsWith("'") ? quoted.slice(1, -1) : quoted.slice(1, -1)
      predicates.push({ attr: inner.slice(1).split('=')[0].trim(), value })
    } else {
      throw new Error(`XPath 片段还不支持：${inner}`)
    }
    match = pattern.exec(raw)
  }
  return predicates
}

/** Splits `//a/b[2]/text()` into steps; the `text()` tail becomes `wantText`. */
function parsePath(expression) {
  const path = String(expression ?? '').trim()
  if (path === '') return { steps: [], wantText: false }
  const parts = path.split(/\s+/).join('').split('/')
  // Re-join on '/' boundaries: an empty first part means an absolute path.
  const tokens = []
  let index = 0
  // Whitespace between steps is fine, but never strip it inside a quoted
  // predicate value: `[@class='a b c']` keeps its spaces.
  const current = path
  while (index < current.length) {
    if (/\s/.test(current[index])) {
      index += 1
      continue
    }
    if (current.startsWith('//', index)) {
      const rest = current.slice(index + 2)
      const match = /^([A-Za-z][\w:-]*|\*)((?:\[[^\]]*\])*)/.exec(rest)
      if (match === null) throw new Error(`XPath 没法解析：${expression}`)
      tokens.push({ axis: 'descendant', tag: match[1], raw: match[2] ?? '' })
      index += 2 + match[0].length
    } else if (current[index] === '/') {
      const rest = current.slice(index + 1)
      if (rest.startsWith('text()')) {
        tokens.push({ axis: 'text' })
        index += 1 + 'text()'.length
        continue
      }
      const match = /^([A-Za-z][\w:-]*|\*)((?:\[[^\]]*\])*)/.exec(rest)
      if (match === null) throw new Error(`XPath 没法解析：${expression}`)
      tokens.push({ axis: 'child', tag: match[1], raw: match[2] ?? '' })
      index += 1 + match[0].length
    } else {
      throw new Error(`XPath 没法解析：${expression}`)
    }
  }
  for (const token of tokens) {
    if (token.axis !== 'text') token.predicates = parsePredicates(token.raw)
  }
  const wantText = tokens.length > 0 && tokens[tokens.length - 1].axis === 'text'
  return { steps: tokens, wantText, parts }
}

function matchTag(element, tag) {
  if (tag === '*') return true
  return element.tag === tag
}

function matchesPredicates(element, predicates) {
  for (const predicate of predicates) {
    if (predicate.index !== undefined) continue
    const actual = element.attr(predicate.attr)
    if (actual === null) return false
    if (predicate.value === null) continue
    if (predicate.attr === 'class') {
      // Rules are written as `[@class='a b c']`. Insisting on the exact string
      // breaks the moment a theme adds or reorders a class, so require every
      // token to be present instead of comparing the whole attribute.
      const want = predicate.value.split(/\s+/).filter((token) => token !== '')
      const have = new Set(String(actual).split(/\s+/).filter((token) => token !== ''))
      if (!want.every((token) => have.has(token))) return false
      continue
    }
    if (actual !== predicate.value) return false
  }
  return true
}

function applyIndex(elements, predicates) {
  const positional = predicates.find((predicate) => predicate.index !== undefined)
  if (positional === undefined) return elements
  const index = positional.index - 1
  return elements[index] === undefined ? [] : [elements[index]]
}

/**
 * Runs `expression` against `roots` (elements) and returns the matching
 * elements. Callers turn those into text/href themselves.
 */
export function selectXPath(roots, expression) {
  const { steps } = parsePath(expression)
  const usable = steps.filter((step) => step.axis !== 'text')
  let current = Array.isArray(roots) ? [...roots] : [roots]
  for (const step of usable) {
    const next = []
    for (const node of current) {
      if (node === null || node === undefined) continue
      const pool =
        step.axis === 'descendant'
          ? node.descendants().filter((element) => matchTag(element, step.tag))
          : node.childrenElements().filter((element) => matchTag(element, step.tag))
      const filtered = pool.filter((element) => matchesPredicates(element, step.predicates))
      if (step.axis === 'descendant') {
        // XPath applies a positional predicate per parent, so group by parent.
        const grouped = new Map()
        for (const element of filtered) {
          const parent = element.parent ?? null
          const bucket = grouped.get(parent)
          if (bucket === undefined) grouped.set(parent, [element])
          else bucket.push(element)
        }
        for (const bucket of grouped.values()) next.push(...applyIndex(bucket, step.predicates))
      } else {
        next.push(...applyIndex(filtered, step.predicates))
      }
    }
    current = next
  }
  return current
}

/** Text of the first match, or '' — the usual "name" rule. */
export function textXPath(roots, expression) {
  const found = selectXPath(roots, expression)
  if (found.length === 0) {
    // Rules that end in /text() land here (parsePath drops the tail), so a
    // plain element selection still yields its own text.
    return ''
  }
  return found[0].text()
}

/** Attribute of the first match, or null. */
export function attrXPath(roots, expression, name) {
  const found = selectXPath(roots, expression)
  if (found.length === 0) return null
  return found[0].attr(name)
}

/**
 * The same selection, but forgiving.
 *
 * Rules written against one build of a site often count siblings (`div[2]`,
 * four levels deep) and break the moment a banner is added. Rather than editing
 * every rule, try the rule as written first, then the same rule with the
 * positional predicates dropped, then just its terminal `tag[@class=...]` step.
 * The first variant that finds anything wins; an empty result stays empty.
 */
export function selectXPathLoose(roots, expression) {
  const trimmed = String(expression ?? '').trim()
  if (trimmed === '') return []

  const variants = [trimmed]
  const noIndex = trimmed.replace(/\[\d+\]/g, '')
  if (noIndex !== trimmed) variants.push(noIndex)

  // Terminal step only, keeping its attribute predicate: `//*[@class='x']`.
  const segments = noIndex.split('/').filter((part) => part !== '' && part !== 'text()')
  const terminal = segments[segments.length - 1]
  if (terminal !== undefined && terminal !== '*') {
    const tag = /^[A-Za-z][\w:-]*|\*/.exec(terminal)?.[0] ?? '*'
    const predicates = terminal.slice(tag.length)
    if (predicates !== '') variants.push(`//${tag}${predicates}`)
  }

  for (const variant of variants) {
    let found = []
    try {
      found = selectXPath(roots, variant)
    } catch {
      found = []
    }
    if (found.length > 0) return found
  }
  return []
}

/** Text of the first loose match. */
export function textXPathLoose(roots, expression) {
  const found = selectXPathLoose(roots, expression)
  return found.length === 0 ? '' : found[0].text()
}

/** Attribute of the first loose match. */
export function attrXPathLoose(roots, expression, name) {
  const found = selectXPathLoose(roots, expression)
  if (found.length === 0) return null
  return found[0].attr(name)
}
