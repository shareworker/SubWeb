import { availableSceBooleanParams } from '@/config/sce-params'

/**
 * 校验 SubConverter-Extended 参数组合，返回错误信息；通过时返回空串。
 * @param {Object} sce - SCE 参数（文本为空串、布尔为 ''/'true'/'false'）
 * @param {string} target - 当前客户端 target
 * @returns {string} 错误信息
 */
export const validateSceParams = (sce, target) => {
  const available = new Set(availableSceBooleanParams(target).map((def) => def.key))
  if (available.has('script') && available.has('expand') && sce.script === 'true' && sce.expand === 'true') {
    return 'Clash Script 与内联展开规则集不能同时开启'
  }
  const interval = String(sce.interval || '').trim()
  if (interval && !/^\d+$/.test(interval)) {
    return '更新间隔必须是非负整数（秒）'
  }
  return ''
}

/**
 * 验证订阅链接格式
 * @param {string} url - 订阅链接
 * @returns {Object} 验证结果
 */
export const validateSubUrl = (url) => {
  if (!url || url.trim() === "") {
    return { valid: false, message: "订阅链接不能为空" };
  }

  // 检查是否包含有效的协议或节点信息
  const hasValidFormat = /^(ss|ssr|vmess|trojan|hysteria|tuic|sip008|vless):\/\//.test(url) ||
                         /^https?:\/\//.test(url) ||
                         /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9]+$/.test(url);

  if (!hasValidFormat) {
    return { valid: false, message: "订阅链接格式可能不正确" };
  }

  return { valid: true };
};

/**
 * 验证表单必填项
 * @param {Object} form - 表单数据
 * @returns {boolean} 验证结果
 */
export const validateForm = (form) => {
  return typeof form.sourceSubUrl === 'string' && form.sourceSubUrl.trim() !== '' &&
    typeof form.clientType === 'string' && form.clientType.trim() !== ''
}
