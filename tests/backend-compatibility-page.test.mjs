import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { computed as vueComputed, nextTick, reactive, watch } from 'vue'

const server = await createServer({ server: { middlewareMode: true, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
after(() => server.close())
const { default: page } = await server.ssrLoadModule('/src/views/Subconverter.vue')

function createPage() {
  const vm = {
    ...page.data(),
    messages: [],
    $message: { success() {}, warning() {}, error() {} }
  }
  for (const [name, method] of Object.entries(page.methods)) vm[name] = method.bind(vm)
  for (const [name, computed] of Object.entries(page.computed)) {
    Object.defineProperty(vm, name, { get: () => computed.call(vm) })
  }
  vm.$message.error = message => vm.messages.push(message)
  vm.copyToClipboard = async () => true
  vm.form.clientType = 'clash'
  vm.form.customBackend = 'http://127.0.0.1:25500/sub?'
  vm.form.sourceSubUrl = 'https://source.example/A'
  return vm
}

// 注册页面 watch（与组件一样异步调度，需 await nextTick()），用于验证依赖 watch 的响应式流程
function createReactivePage() {
  const vm = reactive({ ...page.data(), messages: [] })
  vm.$message = { success() {}, warning() {}, error: message => vm.messages.push(message) }
  for (const [name, method] of Object.entries(page.methods)) vm[name] = method.bind(vm)
  for (const [name, computed] of Object.entries(page.computed)) {
    const ref = vueComputed(() => computed.call(vm))
    Object.defineProperty(vm, name, { get: () => ref.value })
  }
  vm.form.clientType = 'clash'
  vm.form.customBackend = 'http://127.0.0.1:25500/sub?'
  vm.form.sourceSubUrl = 'https://source.example/A'
  const stops = Object.entries(page.watch)
    .filter(([path]) => path !== 'form.customBackend')
    .map(([path, option]) => {
      const handler = typeof option === 'function' ? option : option.handler
      const source = () => path.split('.').reduce((value, key) => value[key], vm)
      return watch(source, handler.bind(vm), { deep: option.deep === true })
    })
  after(() => stops.forEach(stop => stop()))
  return vm
}

test('切换后端类型时恢复各后端上次选择的客户端，并去掉 SCE 来源前缀', async () => {
  const vm = createReactivePage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  await nextTick()
  vm.form.clientType = 'stash'
  vm.form.sourceSubUrl = 'tag:HK,interval:300,https://source.example/A'

  vm.backendTypeOverride = 'legacy'
  await nextTick()
  assert.equal(vm.form.clientType, 'clash', 'legacy 没有 stash，回到 legacy 上次的选择')
  assert.equal(vm.form.sourceSubUrl, 'https://source.example/A', '离开 SCE 时去掉前缀')

  vm.backendTypeOverride = ''
  await nextTick()
  assert.equal(vm.form.clientType, 'stash', '回到 SCE 时恢复 stash')
})

test('导入链接切换后端类型时保留链接自身的 target', async () => {
  const vm = createReactivePage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  await nextTick()
  vm.form.clientType = 'stash'
  vm.backendInfo = { family: 'legacy', version: '' }
  await nextTick()
  assert.equal(vm.form.clientType, 'clash')

  vm.$axios = { get: async () => ({ data: '<title>SubConverter-Extended</title>v1.11.4' }) }
  vm.loadConfig = 'http://127.0.0.1:25500/sub?target=surge&ver=4&url=https%3A%2F%2Fa.example'
  assert.equal(await vm.confirmLoadConfig(), true)
  await nextTick()
  assert.equal(vm.backendType, 'sce')
  assert.equal(vm.form.clientType, 'surge&ver=4')
})

test('SCE 进阶模式下来源编辑器与订阅链接双向同步', async () => {
  const vm = createReactivePage()
  vm.form.sourceSubUrl = 'tag:HK,https://source.example/A'
  vm.advanced = '2'
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  await nextTick()
  assert.equal(vm.sourceEditorActive, true)
  assert.equal(vm.sourceItems[0].tag, 'HK')
  assert.equal(vm.sourceItems[0].url, 'https://source.example/A')

  vm.sourceItems[0].interval = '300'
  await nextTick()
  assert.equal(vm.form.sourceSubUrl, 'tag:HK,interval:300,https://source.example/A')
})

test('设置 SCE emoji 后清空 add_emoji/remove_emoji', async () => {
  const vm = createReactivePage()
  vm.form.sce.addEmoji = 'true'
  vm.form.sce.removeEmoji = 'false'
  vm.form.sce.emoji = 'true'
  await nextTick()
  assert.equal(vm.form.sce.addEmoji, '')
  assert.equal(vm.form.sce.removeEmoji, '')
})

test('未识别的后端按原版处理，客户端列表保持 16 项', () => {
  const vm = createPage()
  assert.equal(vm.backendType, 'legacy')
  assert.equal(Object.keys(vm.clientTypeOptions).length, 16)
  assert.equal(vm.isSceBackend, false)
})

test('探测到 SubConverter-Extended 后切换客户端列表并记住各后端的选择', async () => {
  const vm = createPage()
  let requested
  vm.$axios = { get: async url => { requested = url; return { data: '<title>SubConverter-Extended</title>v1.11.4' } } }
  await vm.probeBackend()
  assert.equal(requested, 'http://127.0.0.1:25500/version')
  assert.equal(vm.backendInfo.family, 'sce')
  assert.equal(vm.backendVersion, 'SubConverter-Extended v1.11.4')
  assert.equal(vm.isSceBackend, true)
  assert.ok(Object.values(vm.clientTypeOptions).includes('stash'))
  assert.ok(!Object.values(vm.clientTypeOptions).includes('auto'))

  // 同一实例内模拟后端类型切换（watch 在真实页面中触发）
  const clash = vm.form.clientType
  vm.backendTypeOverride = 'legacy'
  assert.equal(vm.isSceBackend, false)
  vm.backendTypeOverride = ''
  assert.equal(vm.form.clientType, clash)
})

test('手动覆盖后端类型并提示不一致', () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  vm.backendTypeOverride = 'legacy'
  assert.equal(vm.backendMismatch, true)
  assert.equal(vm.isSceBackend, false)
  vm.backendTypeOverride = 'sce'
  assert.equal(vm.backendMismatch, false)
  assert.equal(vm.isSceBackend, true)
})

test('SCE 后端生成的链接不含 legacy 专属参数，来源前缀被校验后写入', () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  vm.form.sce.list = 'true'
  vm.form.sce.fdn = 'false'
  vm.form.sce.tls13 = ''
  vm.form.sourceSubUrl = 'tag:HK,interval:300,https://source.example/A\nproxy_direct:true,https://source.example/B'
  vm.advanced = '2'
  vm.makeUrlClick()
  const url = new URL(vm.customSubUrl)
  assert.equal(url.origin + url.pathname, 'http://127.0.0.1:25500/sub')
  assert.equal(url.searchParams.get('list'), 'true')
  assert.equal(url.searchParams.get('fdn'), 'false')
  assert.equal(url.searchParams.get('tls13'), null)
  for (const name of ['new_name', 'clash.doh', 'insert', 'scv', 'udp', 'sort']) assert.equal(url.searchParams.get(name), null, name)
  assert.equal(url.searchParams.get('emoji'), null, 'SCE 的 emoji 由 sce.emoji 控制')
  assert.equal(url.searchParams.get('url'), 'tag:HK,interval:300,https://source.example/A|proxy_direct:true,https://source.example/B')

  // 切到 ss：前缀与仅 clash 系支持的 list 都会被忽略
  vm.form.clientType = 'ss'
  assert.equal(vm.suppressedSourceModifierCount, 3)
  vm.makeUrlClick()
  const dropped = new URL(vm.customSubUrl)
  assert.equal(dropped.searchParams.get('url'), 'https://source.example/A|https://source.example/B', 'ss 不支持前缀')
  assert.equal(dropped.searchParams.get('list'), 'true', 'list 对 ss 仍有效')
  assert.equal(dropped.searchParams.get('tls13'), null, '没设置的参数不发送')

  vm.form.clientType = 'quanx'
  vm.makeUrlClick()
  const quanx = new URL(vm.customSubUrl)
  assert.equal(quanx.searchParams.get('url'), 'tag:HK,interval:300,https://source.example/A|https://source.example/B', 'quanx 支持 tag/interval，不支持 proxy_direct')
  assert.equal(vm.sourceItems[1].proxyDirect, 'true', '编辑器状态保留')
  assert.equal(vm.sourceItems[1].url, 'https://source.example/B')
})

test('SCE 后端拒绝非法参数组合，不生成链接', () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  vm.form.sce.script = 'true'
  vm.form.sce.expand = 'true'
  vm.makeUrlClick()
  assert.equal(vm.customSubUrl, '')
  assert.deepEqual(vm.messages, ['Clash Script 与内联展开规则集不能同时开启'])

  vm.form.sce.expand = ''
  vm.form.sce.interval = 'abc'
  vm.makeUrlClick()
  assert.deepEqual(vm.messages[1], '更新间隔必须是非负整数（秒）')
})

test('解析链接时按链接自身后端识别类型', async () => {
  const vm = createPage()
  const sceUrl = 'http://127.0.0.1:25500/sub?target=clash&url=https%3A%2F%2Fa.example&list=true&udp=false&new_name=false&groups=QUJD'
  vm.$axios = {
    get: async url => {
      assert.equal(url, 'http://127.0.0.1:25500/version')
      return { data: '<title>SubConverter-Extended</title>v1.11.4' }
    }
  }
  vm.loadConfig = sceUrl
  const ok = await vm.confirmLoadConfig()
  assert.equal(ok, true)
  assert.equal(vm.backendInfo.family, 'sce')
  assert.equal(vm.form.sce.list, 'true')
  assert.equal(vm.form.sce.udp, 'false')
  assert.equal(vm.form.groups, 'ABC', 'SCE 链接中的 groups 已解码')
  assert.deepEqual(vm.customParams, [])
  assert.equal(vm.sourceItems[0].url, 'https://a.example')
})

test('链接后端探测失败时保留当前后端类型解析', async () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  let probes = 0
  vm.$axios = { get: async () => { probes++; throw new Error('Network Error') } }
  vm.loadConfig = 'http://127.0.0.1:25500/sub?target=clash&url=https%3A%2F%2Fa.example&list=true&udp=false'
  const ok = await vm.confirmLoadConfig()
  assert.equal(ok, true)
  assert.equal(vm.form.sce.list, 'true', '按当前 SCE 类型解析')
  assert.equal(vm.form.sce.udp, 'false')
  assert.deepEqual(vm.customParams, [])
  // customBackend 的 watch 触发的探测不应重复请求并清空已识别的类型
  await vm.probeBackend()
  assert.equal(probes, 1)
  assert.equal(vm.backendType, 'sce')
})

test('传统后端解析 groups/ruleset 并在高级参数中回填', async () => {
  const vm = createPage()
  const groups = Buffer.from('ABC@DEF', 'utf8').toString('base64url')
  const ruleset = Buffer.from('G1\nz', 'utf8').toString('base64url')
  const legacyUrl = `https://converter.example/sub?target=clash&url=https%3A%2F%2Fa.example&groups=${groups}&ruleset=${ruleset}&rename=a%40b`
  vm.loadConfig = legacyUrl
  const ok = await vm.confirmLoadConfig()
  assert.equal(ok, true)
  assert.equal(vm.form.groups, 'ABC\nDEF')
  assert.equal(vm.form.ruleset, 'G1\nz')
  assert.equal(vm.form.rename, 'a@b')
  assert.deepEqual(vm.customParams, [])
})

test('诊断使用 explain=true 并展示摘要', async () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  let requested
  vm.$axios = {
    get: async url => {
      requested = url
      return { data: { ok: true, status_code: 200, target: 'clash', nodes: { total: 277, generated: 277, unsupported: 0 }, output: { bytes: 400829, provider_count: 0 } } }
    }
  }
  await vm.runDiagnostics()
  assert.equal(new URL(requested).searchParams.get('explain'), 'true')
  assert.equal(new URL(requested).searchParams.get('target'), 'clash')
  assert.equal(vm.diagnostics.visible, true)
  assert.match(vm.diagnosticsSummary.join('\n'), /节点：共 277，生成 277/)
  assert.equal(JSON.parse(vm.diagnosticsJson).ok, true)
})

test('诊断失败时提示错误且不打开对话框', async () => {
  const vm = createPage()
  vm.backendInfo = { family: 'sce', version: 'SubConverter-Extended v1.11.4' }
  vm.$axios = { get: async () => { throw new Error('Network Error') } }
  await vm.runDiagnostics()
  assert.equal(vm.diagnostics.visible, false)
  assert.equal(vm.messages.length, 1)
  assert.match(vm.messages[0], /^诊断失败：/)
})
