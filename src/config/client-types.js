import { BACKEND_TYPES } from './backend-types'

/** 传统 subconverter / 肥羊增强后端的客户端类型（显示名 → target 值）。 */
export const CLIENT_TYPES = {
  Clash: 'clash',
  Surge: 'surge&ver=4',
  Quantumult: 'quan',
  QuantumultX: 'quanx',
  Mellow: 'mellow',
  Surfboard: 'surfboard',
  Loon: 'loon',
  singbox: 'singbox',
  ss: 'ss',
  ssd: 'ssd',
  sssub: 'sssub',
  ssr: 'ssr',
  ClashR: 'clashr',
  V2Ray: 'v2ray',
  Trojan: 'trojan',
  Surge3: 'surge&ver=3'
}

/** 肥羊增强后端额外支持的输出格式。 */
export const FEIYANG_CLIENT_TYPES = {
  ...CLIENT_TYPES,
  Shadowrocket: 'shadowrocket',
  VLESS: 'vless',
  Hysteria2: 'hysteria2',
  Mixed: 'mixed'
}

/**
 * SubConverter-Extended 支持的客户端类型。
 * 不包含 auto（后端对 target=auto 返回 400）。
 */
export const SCE_CLIENT_TYPES = {
  Clash: 'clash',
  ClashR: 'clashr',
  Surge4: 'surge&ver=4',
  Surge3: 'surge&ver=3',
  Surge2: 'surge&ver=2',
  Quantumult: 'quan',
  QuantumultX: 'quanx',
  Loon: 'loon',
  Surfboard: 'surfboard',
  Stash: 'stash',
  Mellow: 'mellow',
  singbox: 'singbox',
  ss: 'ss',
  ssd: 'ssd',
  sssub: 'sssub',
  ssr: 'ssr',
  V2Ray: 'v2ray',
  V2RayN: 'v2rayn',
  V2RayNG: 'v2rayng',
  Shadowrocket: 'shadowrocket',
  Trojan: 'trojan',
  VLESS: 'vless',
  Hysteria2: 'hysteria2',
  Mixed: 'mixed'
}

/** 按后端家族返回客户端类型映射；未知家族按 legacy 处理。 */
export function getClientTypes(backendType) {
  if (backendType === BACKEND_TYPES.SCE) return SCE_CLIENT_TYPES
  if (backendType === BACKEND_TYPES.FEIYANG) return FEIYANG_CLIENT_TYPES
  return CLIENT_TYPES
}

/** target 的基础名称（去掉 &ver= 等附加参数）。 */
export function baseTarget(target) {
  return String(target || '').split('&', 1)[0]
}
