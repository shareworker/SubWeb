/**
 * 后端家族识别。
 *
 * - sce: SubConverter-Extended（/version 返回 HTML 页面，内容含 SubConverter-Extended）
 * - feiyang: 肥羊增强后端（/version 纯文本，含 TG@feiyangdigital）
 * - legacy: 传统 subconverter（/version 纯文本，含 subconverter ... backend）
 * - unknown: 无法识别
 */
export const BACKEND_TYPES = Object.freeze({
  SCE: 'sce',
  FEIYANG: 'feiyang',
  LEGACY: 'legacy',
  RELAY: 'relay',
  UNKNOWN: 'unknown'
})

export const BACKEND_LABELS = Object.freeze({
  sce: 'SubConverter-Extended',
  feiyang: '肥羊增强后端',
  legacy: '原版 subconverter',
  relay: '原样中转',
  unknown: '未识别'
})

/** 生成链接时使用的后端家族；unknown 按 legacy 处理以保持既有行为。 */
export function effectiveBackendType(family) {
  return family === BACKEND_TYPES.SCE || family === BACKEND_TYPES.FEIYANG ? family : BACKEND_TYPES.LEGACY
}

/**
 * 解析 /version 响应体，返回 { family, version }。
 * version 为不带 v 前缀的版本号，可能为空。
 */
export function parseBackendIdentity(text) {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  // HTML 页面中的 SVG 路径也含数字，只匹配带 v 前缀的版本号
  const tagged = raw.match(/\bv(\d+\.\d+\.\d+(?:-[0-9a-z.]+)?)\b/i)

  if (lower.includes('subconverter-extended')) {
    return { family: BACKEND_TYPES.SCE, version: tagged ? tagged[1] : '' }
  }
  if (lower.includes('feiyangdigital')) {
    return { family: BACKEND_TYPES.FEIYANG, version: tagged ? tagged[1] : '' }
  }
  if (lower.includes('subconverter')) {
    return { family: BACKEND_TYPES.LEGACY, version: tagged ? tagged[1] : '' }
  }
  return { family: BACKEND_TYPES.UNKNOWN, version: '' }
}

/** SCE / 肥羊后端的版本号展示文本（传统后端沿用 formatVersion）。 */
export function formatBackendVersion(identity) {
  const label = identity.family === BACKEND_TYPES.SCE ? 'SubConverter-Extended'
    : identity.family === BACKEND_TYPES.FEIYANG ? 'feiyang' : ''
  if (!label) return ''
  return identity.version ? `${label} v${identity.version}` : label
}
