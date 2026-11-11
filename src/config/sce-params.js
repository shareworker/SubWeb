import { baseTarget } from './client-types'

/**
 * SubConverter-Extended 参数定义。
 * 布尔参数为三态：''（后端默认）/ 'true' / 'false'。
 */

export const SCE_TEXT_PARAMS = [
  { key: 'group', param: 'group', label: '节点分组名', placeholder: '覆盖直接节点的分组名' },
  { key: 'interval', param: 'interval', label: '更新间隔', placeholder: '秒' },
  { key: 'devId', param: 'dev_id', label: 'Quantumult X 设备 ID', placeholder: 'dev_id', targets: ['quanx'] },
  { key: 'rename', param: 'rename', label: '节点重命名规则', placeholder: '正则@替换，多个规则使用 ` 分隔', textarea: true },
  {
    key: 'providerHeaders',
    param: 'provider_headers',
    label: 'Provider 请求 Header 名称',
    placeholder: 'X-Subscription-Token,X-Age-Key',
    targets: ['clash', 'clashr', 'stash'],
    hint: '只填写名称；实际拉取转换链接的客户端必须携带同名 Header。'
  }
]

export const SCE_BOOLEAN_PARAMS = [
  { key: 'emoji', param: 'emoji', label: 'Emoji' },
  { key: 'addEmoji', param: 'add_emoji', label: '添加 Emoji', emojiDetail: true },
  { key: 'removeEmoji', param: 'remove_emoji', label: '移除旧 Emoji', emojiDetail: true },
  { key: 'appendType', param: 'append_type', label: '追加节点类型' },
  { key: 'tfo', param: 'tfo', label: 'TCP Fast Open' },
  { key: 'udp', param: 'udp', label: 'UDP' },
  { key: 'list', param: 'list', label: '服务端展开节点' },
  { key: 'sort', param: 'sort', label: '排序节点' },
  { key: 'sortScript', param: 'sort_script', label: '使用排序脚本' },
  { key: 'script', param: 'script', label: 'Clash Script', targets: ['clash', 'clashr'] },
  { key: 'insert', param: 'insert', label: '插入预设节点' },
  { key: 'scv', param: 'scv', label: '跳过证书验证' },
  { key: 'fdn', param: 'fdn', label: '过滤废弃节点' },
  { key: 'expand', param: 'expand', label: '内联展开规则集' },
  { key: 'appendInfo', param: 'append_info', label: '追加订阅信息' },
  { key: 'prepend', param: 'prepend', label: '前置插入节点' },
  { key: 'classic', param: 'classic', label: 'Classical 规则', targets: ['clash', 'clashr'] },
  { key: 'tls13', param: 'tls13', label: 'TLS 1.3' },
  { key: 'providerProxyDirect', param: 'provider_proxy_direct', label: 'Provider 直连', targets: ['clash', 'clashr'] },
  { key: 'strict', param: 'strict', label: '严格更新' }
]

export function sceParamAvailable(def, target) {
  if (!def.targets) return true
  return def.targets.includes(baseTarget(target))
}

export function availableSceTextParams(target) {
  return SCE_TEXT_PARAMS.filter((def) => sceParamAvailable(def, target))
}

export function availableSceBooleanParams(target) {
  return SCE_BOOLEAN_PARAMS.filter((def) => sceParamAvailable(def, target))
}

export function isEmojiDetailDisabled(sce, key) {
  return (key === 'addEmoji' || key === 'removeEmoji') && sce.emoji !== ''
}

/** 统计当前 target 下已填写的 SCE 参数数量（用于按钮角标）。 */
export function countActiveSceParams(sce, target) {
  let count = 0
  for (const def of availableSceTextParams(target)) {
    if (String(sce[def.key] || '').trim() !== '') count++
  }
  for (const def of availableSceBooleanParams(target)) {
    if (sce[def.key] !== '') count++
  }
  return count
}


/** 统计已填写但当前 target 不支持的参数数量（生成时会被忽略）。 */
export function countSuppressedSceParams(sce, target) {
  let count = 0
  for (const def of SCE_TEXT_PARAMS) {
    if (!sceParamAvailable(def, target) && String(sce[def.key] || '').trim() !== '') count++
  }
  for (const def of SCE_BOOLEAN_PARAMS) {
    if (!sceParamAvailable(def, target) && sce[def.key] !== '') count++
  }
  return count
}
