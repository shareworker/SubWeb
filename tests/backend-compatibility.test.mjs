import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const { parseBackendOptions } = await server.ssrLoadModule('/src/config/constants.js')

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

test('原样中转：生成 /sub-proxy 链接并解析往返', () => {
  const RELAY = BACKEND_TYPES.RELAY
  const form = createSubscriptionForm()
  form.customBackend = 'https://relay.example'
  form.sourceSubUrl = 'https://src.example/uuid/sub?target=vg'

  const url = makeUrl(form, '2', [], RELAY)
  const parsed = new URL(url)
  assert.equal(parsed.origin + parsed.pathname, 'https://relay.example/sub-proxy')
  assert.equal(parsed.searchParams.get('url'), 'https://src.example/uuid/sub?target=vg')
  assert.equal(parsed.searchParams.get('target'), null, '不携带转换参数')

  // 多条来源或节点链接被拒绝
  form.sourceSubUrl = 'https://a.example\nhttps://b.example'
  assert.equal(makeUrl(form, '2', [], RELAY), '')
  form.sourceSubUrl = 'ss://node'
  assert.equal(makeUrl(form, '2', [], RELAY), '')

  const result = parseUrl(url, RELAY)
  assert.equal(result.success, true)
  assert.equal(result.form.sourceSubUrl, 'https://src.example/uuid/sub?target=vg')
  assert.equal(result.form.customBackend, 'https://relay.example')
  // 即使按 legacy 解析，/sub-proxy 路径也自动走中转分支
  const detected = parseUrl(url, LEGACY)
  assert.equal(detected.success, true)
  assert.equal(detected.form.sourceSubUrl, 'https://src.example/uuid/sub?target=vg')
})

test('原样中转：中转地址残留转换后端路径时先剥掉', () => {
  const RELAY = BACKEND_TYPES.RELAY
  const form = createSubscriptionForm()
  form.sourceSubUrl = 'https://src.example/uuid/sub?target=vg'
  for (const backend of ['https://relay.example/sub?', 'https://relay.example/sub', 'https://relay.example/?']) {
    form.customBackend = backend
    const parsed = new URL(makeUrl(form, '2', [], RELAY))
    assert.equal(parsed.origin + parsed.pathname, 'https://relay.example/sub-proxy', backend)
  }
  // 带路径的中转基址解析回填后生成地址不变
  const parsed = parseUrl('https://relay.example/gw/sub-proxy?url=https%3A%2F%2Fsrc.example%2Fa', RELAY)
  assert.equal(parsed.form.customBackend, 'https://relay.example/gw')
  assert.equal(new URL(makeUrl(parsed.form, '2', [], RELAY)).pathname, '/gw/sub-proxy')
})

// 运行入口脚本生成 sub-proxy.inc / config.js，返回生成产物
function generateProxyInc(env) {
  const dir = mkdtempSync(join(tmpdir(), 'subweb-proxy-'))
  const output = join(dir, 'config.js').replace(/\\/g, '/')
  const inc = join(dir, 'sub-proxy.inc').replace(/\\/g, '/')
  const script = readFileSync('docker/40-subweb-config.sh', 'utf8')
    .replace('/usr/share/nginx/html/config.js', output)
    .replace('/etc/nginx/conf.d/sub-proxy.inc', inc)
  writeFileSync(join(dir, 'entry.sh'), script)
  execFileSync('sh', [join(dir, 'entry.sh').replace(/\\/g, '/')], { env: { PATH: process.env.PATH, ...env } })
  return { conf: existsSync(inc) ? readFileSync(inc, 'utf8') : null, configJs: readFileSync(output, 'utf8') }
}

test('Docker 运行时配置：设置 token 后生成 /sub-proxy 端点', () => {
  const { conf } = generateProxyInc({ VITE_SUB_PROXY_TOKEN: 's3cr3t', VITE_SUB_PROXY_ALLOW: 'vercel.app,example.com' })
  assert.match(conf, /proxy_pass \$arg_url;/)
  assert.match(conf, /s3cr3t/)
  assert.match(conf, /\(\[\^\/\]\*\\\.\)\?\(vercel\\\.app\|example\\\.com\)/, '白名单域名转义后按后缀匹配写入 inc')
  assert.match(conf, /proxy_hide_header Set-Cookie;/)
  assert.match(conf, /proxy_set_header Cookie "";/)
  assert.match(conf, /resolver 223\.5\.5\.5 1\.1\.1\.1/, '固定公网 DNS，不走容器内 DNS')
  assert.match(conf, /proxy_cache_key "\$request_method \$arg_url";/, '缓存按方法隔离')
})

test('/sub-proxy 封禁规则行为：放行外部源，拒绝内网与递归', () => {
  const { conf } = generateProxyInc({ VITE_SUB_PROXY_TOKEN: 's3cr3t', VITE_SUB_PROXY_ALLOW: 'vercel.app,example.com' })
  const rules = [...conf.matchAll(/if \(\$arg_url (!?)~\* "([^"]+)"\) \{ return \d+; \}/g)]
  const requires = rules.filter(r => r[1] === '!').map(r => new RegExp(r[2], 'i'))
  const denies = rules.filter(r => r[1] !== '!').map(r => new RegExp(r[2], 'i'))
  assert.ok(requires.length >= 2 && denies.length >= 3)
  const accepted = u => requires.every(r => r.test(u)) && !denies.some(r => r.test(u))

  for (const u of ['https://vercel.app/a', 'https://x.vercel.app/a', 'https://example.com/sub?x=1']) {
    assert.ok(accepted(u), `应放行 ${u}`)
  }
  const blocked = [
    'https://vercel.app.evil.com/a', 'https://notvercel.app/', 'https://other.com/x', // 白名单外
    'ftp://x/y', 'https://example.com', 'gopher://x/',                                 // 非 http(s) 或无路径
    'http://10.0.0.1/x', 'http://172.31.0.1/x', 'http://192.168.1.1/x', 'http://127.0.0.1/x',
    'http://169.254.169.254/latest', 'http://100.64.0.1/x',                            // 私网/链路本地/CGNAT
    'http://localhost/x', 'http://myurls:8002/x', 'http://myurls.services_default/x',  // 回环/单标签/Docker FQDN
    'http://host.docker.internal/x', 'http://[0::1]/x', 'http://[2001:db8::1]/x',      // docker 域名/IPv6
    'http://user@10.0.0.1/x',                                                        // userinfo 也过不了白名单
    'https://example.com/sub-proxy/inner', 'https://example.com/sub-proxy?a=1', 'https://example.com/sub-proxy' // 自指递归
  ]
  for (const u of blocked) {
    assert.ok(!accepted(u), `应拒绝 ${u}`)
  }
})

test('Docker 运行时配置：非法 token 与非法白名单都不启用 /sub-proxy', () => {
  for (const env of [
    { VITE_SUB_PROXY_TOKEN: 'bad token$' },
    { VITE_SUB_PROXY_TOKEN: 'tok', VITE_SUB_PROXY_ALLOW: 'evil(' }
  ]) {
    const { conf, configJs } = generateProxyInc(env)
    assert.equal(conf, null, `非法配置只警告并保留 404 存根: ${JSON.stringify(env)}`)
    assert.ok(configJs.includes('VITE_SUB_PROXY_TOKEN: ""'), 'config.js 不留已拒绝的 token')
  }
})

test('Docker 运行时配置：token=off 显式关闭端点', () => {
  const { conf, configJs } = generateProxyInc({ VITE_SUB_PROXY_TOKEN: 'off' })
  assert.equal(conf, null)
  assert.ok(configJs.includes('VITE_SUB_PROXY_TOKEN: ""'))
})

test('Docker 运行时配置：token=auto 自动生成并跨启动复用', () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'subweb-state-'))
  const state = join(stateDir, 'state', 'token').replace(/\\/g, '/')
  const env = { VITE_SUB_PROXY_TOKEN: 'auto', SUB_PROXY_TOKEN_STATE: state }
  const first = generateProxyInc(env)
  const token = readFileSync(state, 'utf8')
  assert.match(token, /^[0-9a-f]{32}$/, 'auto 生成 32 位十六进制 token')
  assert.ok(first.conf.includes(`"${token}"`), 'inc 使用生成的 token')
  assert.ok(first.configJs.includes(`"${token}"`), 'config.js 同步同一份 token')
  generateProxyInc(env)
  assert.equal(readFileSync(state, 'utf8'), token, '重启复用同一 token')
  // 状态文件损坏时重新生成而不是崩溃
  writeFileSync(state, 'corrupt!')
  const regenerated = generateProxyInc(env)
  assert.match(readFileSync(state, 'utf8'), /^[0-9a-f]{32}$/, '损坏状态被重新生成')
  assert.notEqual(readFileSync(state, 'utf8'), 'corrupt!')
  assert.ok(regenerated.conf.includes(readFileSync(state, 'utf8')))
})

test('Docker 运行时配置中换行分隔的后端预设拆成多项', () => {
  const dir = mkdtempSync(join(tmpdir(), 'subweb-config-'))
  const output = join(dir, 'config.js').replace(/\\/g, '/')
  const script = readFileSync('docker/40-subweb-config.sh', 'utf8').replace('/usr/share/nginx/html/config.js', output)
  writeFileSync(join(dir, 'entry.sh'), script)
  execFileSync('sh', [join(dir, 'entry.sh').replace(/\\/g, '/')], {
    env: { PATH: process.env.PATH, VITE_BACKEND_OPTIONS: 'https://one.example/sub?\nhttps://two.example' }
  })
  const window = {}
  new Function('window', readFileSync(output, 'utf8'))(window)
  assert.deepEqual(parseBackendOptions(window.__SUB_WEB_CONFIG__.VITE_BACKEND_OPTIONS), [
    'https://one.example/sub?',
    'https://two.example/sub?'
  ])
  assert.deepEqual(parseBackendOptions('https://one.example, https://two.example/sub'), [
    'https://one.example/sub?',
    'https://two.example/sub'
  ])
})
