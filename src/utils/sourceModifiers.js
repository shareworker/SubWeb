import { baseTarget } from '@/config/client-types'

/**
 * SubConverter-Extended 来源前缀：tag: / provider: / interval: / proxy_direct:。
 * 前缀写在订阅链接前，用逗号分隔，例如：provider:HK,interval:300,https://example.com/sub
 */

const PREFIXES = [
  ['tag:', 'tag'],
  ['provider:', 'provider'],
  ['interval:', 'interval'],
  ['proxy_direct:', 'proxyDirect']
]

const MODIFIER_KEYS = ['tag', 'provider', 'interval', 'proxyDirect']

const TARGET_SUPPORT = {
  tag: ['clash', 'clashr', 'surge', 'quanx', 'loon', 'surfboard', 'stash'],
  provider: ['clash', 'clashr', 'surge', 'quanx', 'loon', 'surfboard', 'stash'],
  interval: ['clash', 'clashr', 'surge', 'quanx', 'stash'],
  proxyDirect: ['clash', 'clashr']
}

const REMOTE_ONLY = new Set(['provider', 'interval', 'proxyDirect'])

const LABELS = {
  tag: '来源标签',
  provider: '远程资源名称',
  interval: '单项更新间隔',
  proxyDirect: 'Provider 下载出口'
}

export function createSourceItem(value = {}) {
  return {
    url: String(value.url || ''),
    tag: String(value.tag || ''),
    provider: String(value.provider || ''),
    interval: String(value.interval || ''),
    proxyDirect: String(value.proxyDirect || '')
  }
}

function splitSources(value) {
  return String(value || '')
    .split(/\r?\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseSourceItem(value) {
  const item = createSourceItem({ url: String(value || '').trim() })
  let remainder = item.url
  let parsed = false
  while (remainder) {
    const entry = PREFIXES.find(([prefix]) => remainder.toLowerCase().startsWith(prefix))
    if (!entry) break
    const comma = remainder.indexOf(',')
    if (comma < 0) break
    const [prefix, key] = entry
    item[key] = remainder.slice(prefix.length, comma).trim()
    remainder = remainder.slice(comma + 1).trim()
    parsed = true
  }
  if (parsed && remainder) item.url = remainder
  return item
}

export function parseSourceItems(value) {
  return splitSources(value).map(parseSourceItem)
}

function isRemoteSubscriptionSource(value) {
  const source = String(value || '').trim()
  return !source || /^https?:\/\//i.test(source)
}

export function modifierAvailable(key, target, source = '') {
  const supported = TARGET_SUPPORT[key]?.includes(baseTarget(target)) === true
  return supported && (!REMOTE_ONLY.has(key) || isRemoteSubscriptionSource(source))
}

export function minimumSourceInterval(target) {
  return ['surge', 'stash'].includes(baseTarget(target)) ? 1 : 0
}

function validatePrefixText(value, label, index) {
  const normalized = String(value || '').trim()
  if (normalized.includes(',') || normalized.includes('|') || /[\r\n\0\x7f]/.test(normalized)) {
    throw new TypeError(`第 ${index + 1} 条来源的${label}不能包含逗号、竖线或控制字符`)
  }
}

export function validateSourceItems(items, target) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError('请先输入至少一条订阅链接或节点')
  }
  const targetName = baseTarget(target)
  for (const [index, item] of items.entries()) {
    if (!item.url?.trim()) {
      throw new TypeError(`第 ${index + 1} 条来源缺少 URL 或节点`)
    }
    for (const key of MODIFIER_KEYS) {
      const value = String(item[key] || '').trim()
      if (!value || !modifierAvailable(key, targetName, item.url)) continue
      if (key === 'interval') {
        if (!/^\d+$/.test(value)) {
          throw new TypeError(`第 ${index + 1} 条来源的更新间隔必须是非负整数`)
        }
        const interval = Number(value)
        if (!Number.isSafeInteger(interval) || interval > 2147483647) {
          throw new TypeError(`第 ${index + 1} 条来源的更新间隔超出允许范围`)
        }
        if (interval < minimumSourceInterval(targetName)) {
          throw new TypeError(`第 ${index + 1} 条来源的更新间隔必须大于 0`)
        }
      } else if (key === 'proxyDirect') {
        if (!['true', 'false'].includes(value)) {
          throw new TypeError(`第 ${index + 1} 条来源的 Provider 出口值无效`)
        }
      } else {
        validatePrefixText(value, LABELS[key], index)
      }
    }
  }
}

/** target 为 null 时保留全部前缀（用于表单暂存），否则只保留该 target 可用的前缀。 */
export function serializeSourceItem(item, target = null) {
  const prefixes = []
  const push = (key, raw) => {
    const value = String(raw || '').trim()
    if (value && (target === null || modifierAvailable(key, target, item.url))) {
      prefixes.push(`${key === 'proxyDirect' ? 'proxy_direct' : key}:${value}`)
    }
  }
  push('tag', item.tag)
  push('provider', item.provider)
  push('interval', item.interval)
  push('proxyDirect', item.proxyDirect)
  return [...prefixes, String(item.url || '').trim()].join(',')
}

export function serializeSourceItems(items, target) {
  validateSourceItems(items, target)
  return items.map((item) => serializeSourceItem(item, target)).join('\n')
}

export function hasSourceModifiers(items) {
  return (items || []).some((item) => MODIFIER_KEYS.some((key) => String(item?.[key] || '').trim()))
}

export function serializePlainSourceItems(items) {
  return (items || [])
    .map((item) => String(item?.url || '').trim())
    .filter(Boolean)
    .join('\n')
}

export function countSuppressedSourceModifiers(items, target) {
  return (items || []).reduce(
    (count, item) =>
      count +
      MODIFIER_KEYS.filter((key) => {
        const value = String(item?.[key] || '').trim()
        return value && !modifierAvailable(key, target, item?.url)
      }).length,
    0
  )
}
