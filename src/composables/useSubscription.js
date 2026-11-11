import { validateForm } from '@/utils/validators'
import { processSubUrl } from '@/utils/formatters'
import { BACKEND_TYPES } from '@/config/backend-types'
import { toUrlSafeBase64, fromUrlSafeBase64 } from '@/utils/base64'
import {
  SCE_TEXT_PARAMS,
  SCE_BOOLEAN_PARAMS,
  availableSceTextParams,
  availableSceBooleanParams
} from '@/config/sce-params'

// 所有后端共享的文本参数
const sharedStringParams = {
  remoteConfig: 'config',
  excludeRemarks: 'exclude',
  includeRemarks: 'include',
  filename: 'filename'
}

// 传统 / 肥羊后端额外的文本参数（SCE 下由 form.sce 承载）
const legacyStringParams = {
  group: 'group',
  interval: 'interval',
  devId: 'dev_id',
  rename: 'rename'
}

const booleanParams = {
  emoji: 'emoji',
  nodeList: 'list',
  tfo: 'tfo',
  scv: 'scv',
  fdn: 'fdn',
  expand: 'expand',
  sort: 'sort'
}

// 表单中每行一项，发送时以 @ 连接并做 URL-safe Base64 编码；SCE 不支持
const base64Params = {
  groups: 'groups',
  ruleset: 'ruleset'
}

/** SCE 参数：文本为空串表示不发送；布尔为三态 ''（后端默认）/ 'true' / 'false'。 */
export function createSceParams() {
  const sce = {}
  for (const def of SCE_TEXT_PARAMS) sce[def.key] = ''
  for (const def of SCE_BOOLEAN_PARAMS) sce[def.key] = ''
  return sce
}

export function createSubscriptionForm() {
  return {
    sourceSubUrl: '',
    clientType: '',
    customBackend: '',
    remoteConfig: '',
    excludeRemarks: '',
    includeRemarks: '',
    filename: '',
    group: '',
    interval: '',
    devId: '',
    rename: '',
    groups: '',
    ruleset: '',
    emoji: true,
    nodeList: false,
    extraset: false,
    sort: false,
    udp: null, // null 表示未指定，区别于显式关闭 UDP。
    tfo: false,
    scv: true,
    fdn: false,
    expand: true,
    appendType: false,
    insert: false,
    new_name: true,
    sce: createSceParams(),
    tpl: {
      surge: { doh: false },
      clash: { doh: false }
    }
  }
}

function isSce(backendType) {
  return backendType === BACKEND_TYPES.SCE
}

function knownParamNames(backendType) {
  const known = new Set(['target', 'url', ...Object.values(sharedStringParams), 'explain', 'groups', 'ruleset', 'new_name'])
  if (isSce(backendType)) {
    for (const def of SCE_TEXT_PARAMS) known.add(def.param)
    for (const def of SCE_BOOLEAN_PARAMS) known.add(def.param)
  } else {
    for (const name of ['insert', 'append_type', 'udp', 'surge.doh', 'clash.doh', 'new_name']) known.add(name)
    for (const name of Object.values(legacyStringParams)) known.add(name)
    for (const name of Object.values(booleanParams)) known.add(name)
    for (const name of Object.values(base64Params)) known.add(name)
  }
  return known
}

/**
 * 生成和解析共享参数规则；解析成功前不修改调用方的表单。
 * backendType 取值见 BACKEND_TYPES，缺省为传统 subconverter 规则。
 */
export function useSubscription(defaultBackend = '') {
  const makeUrl = (form, advanced, customParams = [], backendType = BACKEND_TYPES.LEGACY) => {
    if (!validateForm(form)) return ''

    const backend = form.customBackend || defaultBackend
    if (!backend) return ''

    const [target, version] = form.clientType.split('&ver=')
    const params = new URLSearchParams()
    params.set('target', target)
    if (target === 'surge' && version) params.set('ver', version)
    params.set('url', processSubUrl(form.sourceSubUrl))
    if (!isSce(backendType)) params.set('insert', form.insert)

    if (advanced === '2') {
      for (const [field, param] of Object.entries(sharedStringParams)) {
        if (form[field]) params.set(param, form[field])
      }
      if (isSce(backendType)) {
        appendSceParams(params, form.sce || {}, target)
      } else {
        appendLegacyParams(params, form, target)
      }
      for (const { name, value } of customParams) {
        if (name && value !== null && value !== undefined) params.append(name, value)
      }
    }

    const separator = backend.includes('?') ? (/[?&]$/.test(backend) ? '' : '&') : '?'
    return backend + separator + params.toString()
  }

  const appendLegacyParams = (params, form, target) => {
    for (const [field, param] of Object.entries(legacyStringParams)) {
      if (form[field]) params.set(param, form[field])
    }
    if (form.appendType) params.set('append_type', true)
    for (const [field, param] of Object.entries(booleanParams)) {
      params.set(param, form[field])
    }
    for (const [field, param] of Object.entries(base64Params)) {
      const entries = String(form[field] || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      if (entries.length) params.set(param, toUrlSafeBase64(entries.join('@')))
    }
    if (form.udp !== null) params.set('udp', form.udp)
    if (form.tpl.surge.doh) params.set('surge.doh', true)
    if (target === 'clash') {
      if (form.tpl.clash.doh) params.set('clash.doh', true)
      params.set('new_name', form.new_name)
    }
  }

  // 只发送当前 target 可用且已填写的参数，未设置的交给后端默认
  const appendSceParams = (params, sce, target) => {
    for (const def of availableSceTextParams(target)) {
      const value = String(sce[def.key] || '').trim()
      if (value) params.set(def.param, value)
    }
    for (const def of availableSceBooleanParams(target)) {
      const value = sce[def.key]
      if (value === 'true' || value === 'false') params.set(def.param, value)
    }
  }

  const parseUrl = (input, backendType = BACKEND_TYPES.LEGACY) => {
    const invalid = { success: false, message: '请输入正确的订阅地址!' }
    if (!input || !input.trim()) return { success: false, message: '订阅链接不能为空' }

    let url
    try {
      url = new URL(input)
    } catch {
      return invalid
    }
    if (!['http:', 'https:'].includes(url.protocol)) return invalid

    const params = url.searchParams
    const form = createSubscriptionForm()
    form.clientType = params.get('target') || ''
    form.sourceSubUrl = (params.get('url') || '').replace(/\|/g, '\n')
    if (!validateForm(form)) return invalid

    form.customBackend = url.origin + url.pathname + '?'
    if (form.clientType === 'surge') {
      form.clientType += '&ver=' + (params.get('ver') || '4')
    }
    for (const [field, param] of Object.entries(sharedStringParams)) {
      form[field] = params.get(param) || ''
    }
    if (isSce(backendType)) {
      // SCE 不支持的参数解码后回填到 legacy 字段，切回传统后端时可重新编码
      for (const field of ['groups', 'ruleset']) {
        const raw = params.get(field)
        if (raw) form[field] = (fromUrlSafeBase64(raw) || raw).split('@').join('\n')
      }
      form.new_name = params.get('new_name') !== 'false'
      parseSceParams(params, form.sce)
    } else {
      parseLegacyParams(params, form)
    }

    const knownParams = knownParamNames(backendType)
    if (form.clientType.startsWith('surge&')) knownParams.add('ver')
    const customParams = Array.from(params.entries())
      .filter(([name]) => !knownParams.has(name))
      .map(([name, value]) => ({ name, value }))
    return { success: true, form, customParams }
  }

  const parseLegacyParams = (params, form) => {
    for (const [field, param] of Object.entries(legacyStringParams)) {
      form[field] = params.get(param) || ''
    }
    // 保留既有导入语义：缺失的布尔选项为 false，UDP 单独保留未指定状态。
    for (const [field, param] of Object.entries(booleanParams)) {
      form[field] = params.get(param) === 'true'
    }
    for (const [field, param] of Object.entries(base64Params)) {
      const raw = params.get(param)
      form[field] = raw ? (fromUrlSafeBase64(raw) || raw).split('@').join('\n') : ''
    }
    form.insert = params.get('insert') === 'true'
    form.appendType = params.get('append_type') === 'true'
    form.udp = params.has('udp') ? params.get('udp') === 'true' : null
    form.tpl.surge.doh = params.get('surge.doh') === 'true'
    form.tpl.clash.doh = params.get('clash.doh') === 'true'
    form.new_name = params.get('new_name') === 'true'
  }

  const parseSceParams = (params, sce) => {
    for (const def of SCE_TEXT_PARAMS) {
      sce[def.key] = params.get(def.param) || ''
    }
    for (const def of SCE_BOOLEAN_PARAMS) {
      sce[def.key] = params.has(def.param) ? String(params.get(def.param) === 'true') : ''
    }
  }

  return { makeUrl, parseUrl }
}
