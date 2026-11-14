import { getRuntimeConfig } from './runtime'

const env = import.meta.env

/** 接受裸域名、/sub 或 /sub? 形式，统一生成后端转换地址。 */
function toBackendUrl(value) {
  if (!value) return ''
  const base = value.replace(/\/+$/, '')
  if (/\/sub(\?.*)?$/.test(base)) return base
  return base + '/sub?'
}

// 内置后端预设，用户可在自定义后端中直接选择
const BUILTIN_BACKEND_PRESETS = [
  'https://clashback.serviceofyi.top/sub?',
  'https://clashback-etd.serviceofyi.top/sub?'
]

/** 后端预设列表：逗号或空白（含换行）分隔，统一成 /sub? 形式。 */
export function parseBackendOptions(value) {
  if (!value) return []
  return String(value)
    .split(/[\s,]+/)
    .map((item) => toBackendUrl(item.trim()))
    .filter(Boolean)
}

export const CONSTANTS = {
  PROJECT: getRuntimeConfig('VITE_PROJECT', env.VITE_PROJECT),
  REMOTE_CONFIG_SAMPLE: getRuntimeConfig('VITE_SUBCONVERTER_REMOTE_CONFIG', env.VITE_SUBCONVERTER_REMOTE_CONFIG),
  DOC_ADVANCED: getRuntimeConfig('VITE_SUBCONVERTER_DOC_ADVANCED', env.VITE_SUBCONVERTER_DOC_ADVANCED),
  BACKEND_RELEASE: getRuntimeConfig('VITE_BACKEND_RELEASE', env.VITE_BACKEND_RELEASE),
  DEFAULT_BACKEND: toBackendUrl(getRuntimeConfig('VITE_SUBCONVERTER_DEFAULT_BACKEND', env.VITE_SUBCONVERTER_DEFAULT_BACKEND)),
  BACKEND_PRESETS: BUILTIN_BACKEND_PRESETS,
  BACKEND_OPTIONS: parseBackendOptions(getRuntimeConfig('VITE_BACKEND_OPTIONS', env.VITE_BACKEND_OPTIONS)),
  SHORT_URL_API: getRuntimeConfig('VITE_MYURLS_API', env.VITE_MYURLS_API),
  CONFIG_UPLOAD_API: getRuntimeConfig('VITE_CONFIG_UPLOAD_API', env.VITE_CONFIG_UPLOAD_API),
  // 原样中转：/sub-proxy 端点的部署地址（留空时取页面同源）与访问令牌
  RELAY_BASE: getRuntimeConfig('VITE_SUB_PROXY_BASE', env.VITE_SUB_PROXY_BASE),
  RELAY_TOKEN: getRuntimeConfig('VITE_SUB_PROXY_TOKEN', env.VITE_SUB_PROXY_TOKEN),
  BOT_LINK: getRuntimeConfig('VITE_BOT_LINK', env.VITE_BOT_LINK),
  USE_STORAGE: getRuntimeConfig('VITE_USE_STORAGE', env.VITE_USE_STORAGE) === 'true',
  CACHE_TTL: Number(getRuntimeConfig('VITE_CACHE_TTL', env.VITE_CACHE_TTL)) || 3600,
  DEFAULT_CLIENT_TYPE: 'clash',
  BUTTON_WIDTH: '140px',
  LARGE_BUTTON_WIDTH: '290px'
};
