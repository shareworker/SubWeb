import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
after(() => server.close())

const { BACKEND_TYPES, parseBackendIdentity, formatBackendVersion } = await server.ssrLoadModule('/src/config/backend-types.js')
const { CLIENT_TYPES, getClientTypes } = await server.ssrLoadModule('/src/config/client-types.js')
const { toUrlSafeBase64, fromUrlSafeBase64 } = await server.ssrLoadModule('/src/utils/base64.js')
const { useSubscription, createSubscriptionForm, createSceParams } = await server.ssrLoadModule('/src/composables/useSubscription.js')
const modifiers = await server.ssrLoadModule('/src/utils/sourceModifiers.js')
const sceParams = await server.ssrLoadModule('/src/config/sce-params.js')
const { validateSceParams } = await server.ssrLoadModule('/src/utils/validators.js')
const { BackendService } = await server.ssrLoadModule('/src/services/backendService.js')

const { makeUrl, parseUrl } = useSubscription('https://sub.example/sub?')
const SCE = BACKEND_TYPES.SCE
const LEGACY = BACKEND_TYPES.LEGACY

function sceForm(target = 'clash') {
  const form = createSubscriptionForm()
  form.customBackend = 'http://127.0.0.1:25500/sub?'
  form.clientType = target
  form.sourceSubUrl = 'https://source.example/A'
  return form
}

function paramsOf(url) {
  return new URL(url).searchParams
}

test('识别三种后端的 /version 响应', async () => {
  const sceHtml = '<title>SubConverter-Extended</title><div class="info-value">v1.11.4</div>'
  assert.deepEqual(parseBackendIdentity(sceHtml), { family: BACKEND_TYPES.SCE, version: '1.11.4' })
  assert.deepEqual(parseBackendIdentity('subconverter v2.1.0 TG@feiyangdigital backend\n'), { family: BACKEND_TYPES.FEIYANG, version: '2.1.0' })
  assert.deepEqual(parseBackendIdentity('subconverter v0.9.0-a0d4eab backend\n'), { family: BACKEND_TYPES.LEGACY, version: '0.9.0-a0d4eab' })
  assert.equal(parseBackendIdentity('<html>nothing</html>').family, BACKEND_TYPES.UNKNOWN)
  assert.equal(formatBackendVersion(parseBackendIdentity(sceHtml)), 'SubConverter-Extended v1.11.4')
  assert.equal(formatBackendVersion(parseBackendIdentity('subconverter v0.9.0 backend')), '')
})

test('probeBackend 返回家族与展示版本', async () => {
  const html = '<title>SubConverter-Extended</title>v1.11.4'
  const info = await BackendService.probeBackend({ get: async () => ({ data: html }) }, 'https://h.example/sub?')
  assert.deepEqual(info, { family: BACKEND_TYPES.SCE, version: 'SubConverter-Extended v1.11.4' })
  assert.equal(await BackendService.getBackendVersion({ get: async () => ({ data: 'subconverter v0.9.0 backend' }) }), ' v0.9.0 backend')
})

test('按后端家族区分客户端类型', () => {
  assert.equal(CLIENT_TYPES.Clash, 'clash')
  assert.ok(!('VLESS' in CLIENT_TYPES) && !('Stash' in CLIENT_TYPES))
  const sce = Object.values(getClientTypes(SCE))
  assert.ok(sce.includes('stash') && sce.includes('vless') && sce.includes('mixed') && !sce.includes('auto'))
  const feiyang = Object.values(getClientTypes(BACKEND_TYPES.FEIYANG))
  assert.ok(feiyang.includes('shadowrocket') && feiyang.includes('hysteria2') && !feiyang.includes('stash') && !feiyang.includes('v2rayng'))
  assert.equal(getClientTypes(BACKEND_TYPES.UNKNOWN), CLIENT_TYPES)
  assert.equal(getClientTypes(''), CLIENT_TYPES)
})

test('SCE 生成：不发送 new_name / clash.doh / insert，发送三态参数', () => {
  const form = sceForm()
  form.sce.list = 'true'
  form.sce.udp = 'false'
  form.sce.fdn = ''
  form.sce.tls13 = 'true'
  form.sce.providerHeaders = 'X-Token'
  form.sce.script = 'true'
  const params = paramsOf(makeUrl(form, '2', [], SCE))
  assert.equal(params.get('target'), 'clash')
  assert.equal(params.get('url'), 'https://source.example/A')
  for (const name of ['new_name', 'clash.doh', 'surge.doh', 'insert', 'config', 'include', 'exclude']) {
    assert.equal(params.get(name), null, name)
  }
  assert.equal(params.get('list'), 'true')
  assert.equal(params.get('udp'), 'false')
  assert.equal(params.get('tls13'), 'true')
  assert.equal(params.get('provider_headers'), 'X-Token')
  assert.equal(params.get('fdn'), null)
  assert.equal(params.get('script'), 'true', 'clash 支持 script')
  assert.equal(params.get('emoji'), null)
})

test('SCE 参数按 target 过滤可用性', () => {
  const form = sceForm('quanx')
  form.sce.devId = 'dev1'
  form.sce.providerHeaders = 'X-Token'
  form.sce.script = 'true'
  form.sce.tls13 = 'false'
  const params = paramsOf(makeUrl(form, '2', [], SCE))
  assert.equal(params.get('dev_id'), 'dev1')
  assert.equal(params.get('provider_headers'), null)
  assert.equal(params.get('script'), null)
  assert.equal(params.get('tls13'), 'false')
  assert.equal(params.get('udp'), null)

  const clashR = sceForm('clashr')
  clashR.sce.script = 'true'
  clashR.sce.classic = 'true'
  clashR.sce.providerProxyDirect = 'false'
  const clashParams = paramsOf(makeUrl(clashR, '2', [], SCE))
  assert.equal(clashParams.get('script'), 'true')
  assert.equal(clashParams.get('classic'), 'true')
  assert.equal(clashParams.get('provider_proxy_direct'), 'false')
})

test('SCE 进阶模式才携带 SCE 参数', () => {
  const form = sceForm()
  form.sce.list = 'true'
  const basic = paramsOf(makeUrl(form, '1', [], SCE))
  const advanced = paramsOf(makeUrl(form, '2', [], SCE))
  assert.equal(basic.get('list'), null)
  assert.equal(advanced.get('list'), 'true')
})

test('SCE 生成与解析往返', () => {
  const form = sceForm()
  form.remoteConfig = 'https://cfg.example/a.yaml'
  form.includeRemarks = 'HK'
  form.filename = 'nodes'
  form.sce.group = 'MyGroup'
  form.sce.interval = '3600'
  form.sce.list = 'true'
  form.sce.udp = 'true'
  form.sce.sortScript = 'false'
  const url = makeUrl(form, '2', [{ name: 'custom_flag', value: '1' }], SCE)
  const result = parseUrl(url, SCE)
  assert.equal(result.success, true)
  assert.equal(result.form.remoteConfig, 'https://cfg.example/a.yaml')
  assert.equal(result.form.filename, 'nodes')
  assert.equal(result.form.sce.group, 'MyGroup')
  assert.equal(result.form.sce.interval, '3600')
  assert.equal(result.form.sce.list, 'true')
  assert.equal(result.form.sce.udp, 'true')
  assert.equal(result.form.sce.sortScript, 'false')
  assert.equal(result.form.sce.fdn, '', '缺省参数保持未设置')
  assert.equal(result.form.new_name, true, 'SCE 表单不维护 legacy 开关')
  assert.deepEqual(result.customParams, [{ name: 'custom_flag', value: '1' }])
  assert.equal(result.form.customBackend, 'http://127.0.0.1:25500/sub?')
})

test('SCE 解析丢弃 groups/ruleset/new_name，但回填 legacy 字段以便切换后端', () => {
  const url = 'https://sub.example/sub?target=clash&url=https%3A%2F%2Fa.example&groups=QUJD&new_name=false&list=true'
  const result = parseUrl(url, SCE)
  assert.equal(result.success, true)
  assert.deepEqual(result.customParams, [])
  assert.equal(result.form.sce.list, 'true')
  assert.equal(result.form.groups, 'ABC', 'groups 按 legacy 规则解码后回填')
  assert.equal(result.form.new_name, false)
})

test('legacy 生成 groups/ruleset 使用 URL-safe Base64 并以 @ 连接', () => {
  const form = createSubscriptionForm()
  form.clientType = 'clash'
  form.sourceSubUrl = 'https://source.example/A'
  form.groups = 'name=🎯 港, type=url-test, proxies=HK'
  form.ruleset = 'ruleset1\nruleset2'
  const params = paramsOf(makeUrl(form, '2', []))
  assert.equal(params.get('groups'), toUrlSafeBase64('name=🎯 港, type=url-test, proxies=HK'))
  assert.equal(params.get('ruleset'), toUrlSafeBase64('ruleset1@ruleset2'))
  assert.ok(!params.get('groups').includes('='))

  const parsed = parseUrl(makeUrl(form, '2', []))
  assert.equal(parsed.success, true)
  assert.equal(parsed.form.groups, form.groups)
  assert.equal(parsed.form.ruleset, 'ruleset1\nruleset2')
  assert.deepEqual(parsed.customParams, [])
})

test('legacy 解析 Surge 版本并保留未知参数', () => {
  const result = parseUrl('https://sub.example/sub?target=surge&ver=3&url=https%3A%2F%2Fa.example&foo=bar')
  assert.equal(result.form.clientType, 'surge&ver=3')
  assert.deepEqual(result.customParams, [{ name: 'foo', value: 'bar' }])
})

test('URL-safe Base64 处理 UTF-8 与填充', () => {
  const value = '节点😀/+#=@'
  const encoded = toUrlSafeBase64(value)
  assert.ok(!/[+/=]/.test(encoded))
  assert.equal(fromUrlSafeBase64(encoded), value)
  assert.equal(fromUrlSafeBase64(toUrlSafeBase64('')), '')
  assert.equal(fromUrlSafeBase64('abc'), '', '非法长度')
  assert.equal(fromUrlSafeBase64('!!!!'), '', '非法字符')
  assert.equal(fromUrlSafeBase64(''), '')
})

test('来源前缀解析、序列化与校验', () => {
  const items = modifiers.parseSourceItems('tag:HK,provider:vip,interval:300,proxy_direct:true,https://a.example/sub\nss://node')
  assert.equal(modifiers.parseSourceItems('tag:HK,')[0].url, '', '只有前缀没有 URL 时 URL 为空')
  assert.equal(items.length, 2)
  const { url: _url, ...modifiersOfFirst } = items[0]
  assert.deepEqual(modifiersOfFirst, { tag: 'HK', provider: 'vip', interval: '300', proxyDirect: 'true' })
  assert.equal(items[0].url, 'https://a.example/sub')
  assert.equal(items[1].url, 'ss://node')

  const clash = 'clash'
  const clashOut = modifiers.serializeSourceItem({ ...items[0] }, clash)
  assert.equal(clashOut, 'tag:HK,provider:vip,interval:300,proxy_direct:true,https://a.example/sub')
  const ssOut = modifiers.serializeSourceItem({ ...items[0] }, 'ss')
  assert.equal(ssOut, 'https://a.example/sub', 'ss 不支持任何前缀')
  assert.equal(modifiers.serializeSourceItem({ ...items[0] }, null), 'tag:HK,provider:vip,interval:300,proxy_direct:true,https://a.example/sub')
  assert.equal(modifiers.countSuppressedSourceModifiers(items, 'ss'), 4)
  assert.equal(modifiers.countSuppressedSourceModifiers([items[1]], 'ss'), 0)
  assert.equal(modifiers.serializePlainSourceItems(items), 'https://a.example/sub\nss://node')
  assert.equal(modifiers.hasSourceModifiers(items), true)

  assert.throws(() => modifiers.serializeSourceItems([{ url: 'https://a.example', interval: '-1' }], 'clash'), /更新间隔/)
  assert.throws(() => modifiers.serializeSourceItems([{ url: 'https://a.example', proxyDirect: 'yes' }], 'clash'), /出口值无效/)
  assert.throws(() => modifiers.serializeSourceItems([{ url: '', tag: 'x' }], 'clash'), /缺少/)
  assert.equal(modifiers.validateSourceItems([{ url: 'tag:HK' }], 'clash'), '第 1 条来源的前缀格式不正确，前缀值需要以逗号分隔')
  assert.equal(modifiers.validateSourceItems([{ url: '' }], 'clash'), '第 1 条来源缺少 URL 或节点')
  assert.equal(modifiers.validateSourceItems([{ url: 'https://a.example' }], 'clash'), '')
  assert.equal(modifiers.minimumSourceInterval('surge'), 1)
  assert.equal(modifiers.minimumSourceInterval('clash'), 0)
})

test('SCE 参数校验：script 与 expand 互斥', () => {
  const sce = createSceParams()
  assert.equal(validateSceParams(sce, 'clash'), '')
  sce.script = 'true'
  sce.expand = 'true'
  assert.match(validateSceParams(sce, 'clash'), /不能同时开启/)
  assert.equal(validateSceParams(sce, 'quanx'), '', '非 clash/clashr 不限制')
  sce.expand = ''
  sce.interval = '1.5'
  assert.match(validateSceParams(sce, 'clash'), /更新间隔/)
  sce.interval = '60'
  assert.equal(validateSceParams(sce, 'clash'), '')
})

test('emoji 设置后禁用 Emoji 细节参数', () => {
  const sce = createSceParams()
  assert.equal(sceParams.isEmojiDetailDisabled(sce, 'addEmoji'), false)
  sce.emoji = 'false'
  assert.equal(sceParams.isEmojiDetailDisabled(sce, 'addEmoji'), true)
  assert.equal(sceParams.isEmojiDetailDisabled(sce, 'udp'), false)
})
