<template>
  <div>
    <el-row style="margin-top: 10px">
      <el-col>
        <el-card>
          <template #header>
            Subscription Converter
            <svg-icon icon-class="github" style="margin-left: 20px" @click="goToProject" />

            <div style="display: inline-block; position:absolute; right: 20px">{{ backendVersion }}</div>
          </template>
          <el-container>
            <el-form class="subconverter-form" :model="form" label-width="140px" label-position="left" style="width: 100%">
              <el-form-item label="模式设置:">
                <el-radio v-model="advanced" value="1">基础模式</el-radio>
                <el-radio v-model="advanced" value="2">进阶模式</el-radio>
              </el-form-item>
              <el-form-item label="订阅链接:">
                <div v-if="sourceEditorActive" class="source-items">
                  <div v-for="(item, i) in sourceItems" :key="i" class="source-item">
                    <el-input v-model="item.url" placeholder="订阅链接或节点 URI" @blur="saveSubUrl">
                      <template #append>
                        <el-button :icon="Delete" :disabled="sourceItems.length === 1" aria-label="删除来源"
                          @click="sourceItems.splice(i, 1)" />
                      </template>
                    </el-input>
                    <div class="source-modifiers">
                      <el-input v-if="sourceModifierAvailable('tag', item)" v-model="item.tag" placeholder="tag: 来源标签" />
                      <el-input v-if="sourceModifierAvailable('provider', item)" v-model="item.provider" placeholder="provider: 资源名称" />
                      <el-input v-if="sourceModifierAvailable('interval', item)" v-model="item.interval" placeholder="interval: 更新间隔(秒)" />
                      <el-select v-if="sourceModifierAvailable('proxyDirect', item)" v-model="item.proxyDirect" placeholder="proxy_direct: 默认">
                        <el-option label="proxy_direct: 默认" value="" />
                        <el-option label="proxy_direct: true" value="true" />
                        <el-option label="proxy_direct: false" value="false" />
                      </el-select>
                    </div>
                  </div>
                  <div class="source-actions">
                    <el-button :icon="Plus" @click="sourceItems.push(createSourceItem())">添加来源</el-button>
                    <span v-if="suppressedSourceModifierCount" class="form-hint">
                      当前客户端不支持 {{ suppressedSourceModifierCount }} 个已填写的来源前缀，生成时将忽略
                    </span>
                  </div>
                </div>
                <el-input v-else v-model="form.sourceSubUrl" type="textarea" :rows="3"
                  placeholder="支持订阅或ss/ssr/vmess链接，多个链接每行一个或用 | 分隔" @blur="saveSubUrl" />
              </el-form-item>
              <el-form-item label="客户端:">
                <el-select v-model="form.clientType" style="width: 100%">
                  <el-option v-for="(v, k) in clientTypeOptions" :key="k" :label="k" :value="v"></el-option>
                </el-select>
              </el-form-item>

              <div v-if="advanced === '2'">
                <el-form-item label="后端地址:">
                  <el-autocomplete style="width: 100%" v-model="form.customBackend" :fetch-suggestions="backendSearch"
                    placeholder="动动小手，（建议）自行搭建后端服务。例：http://127.0.0.1:25500/sub?">
                    <template #append>
                      <el-button @click="gotoGayhub" :icon="Link" aria-label="前往项目仓库"><span class="backend-link-text">前往项目仓库</span></el-button>
                    </template>
                  </el-autocomplete>
                </el-form-item>
                <el-form-item label="后端类型:">
                  <el-select v-model="backendTypeOverride" style="width: 100%">
                    <el-option :label="autoBackendLabel" value="" />
                    <el-option v-for="type in backendTypeChoices" :key="type" :label="backendLabels[type]" :value="type" />
                  </el-select>
                  <div v-if="backendMismatch" class="form-hint">
                    检测到后端为 {{ backendLabels[backendInfo.family] }}，与手动选择的类型不一致
                  </div>
                </el-form-item>
                <el-form-item label="远程配置:">
                  <el-select v-model="form.remoteConfig" allow-create filterable placeholder="请选择" style="width: 100%">
                    <el-option-group v-for="group in options.remoteConfig" :key="group.label" :label="group.label">
                      <el-option v-for="item in group.options" :key="item.value" :label="item.label"
                        :value="item.value"></el-option>
                    </el-option-group>
                  </el-select>
                </el-form-item>
                <el-form-item label="Include:">
                  <el-input v-model="form.includeRemarks" placeholder="节点名包含的关键字，支持正则" />
                </el-form-item>
                <el-form-item label="Exclude:">
                  <el-input v-model="form.excludeRemarks" placeholder="节点名不包含的关键字，支持正则" />
                </el-form-item>
                <el-form-item label="FileName:">
                  <el-input v-model="form.filename" placeholder="返回的订阅文件名" />
                </el-form-item>
                <el-form-item label="转换参数:">
                  <el-button @click="paramsDialogVisible = true">
                    {{ isSceBackend ? 'SCE 参数' : '高级参数' }}<span v-if="activeParamCount">（已设 {{ activeParamCount }} 项）</span>
                  </el-button>
                  <el-button v-if="isSceBackend" @click="runDiagnostics" :loading="diagnostics.loading" :disabled="!canGenerateUrl">
                    诊断
                  </el-button>
                </el-form-item>

                <el-form-item v-for="(param, i) in customParams" :key="i">
                  <template #label>
                    <el-input v-model="param.name" placeholder="自定义参数名">
                      <template #suffix>
                        <div style="width: 10px;">:</div>
                      </template>
                    </el-input>
                  </template>
                  <el-input v-model="param.value" placeholder="自定义参数内容">
                    <template #suffix>
                      <el-button link :icon="Delete" style="margin-right: 5px" @click="customParams.splice(i, 1)" />
                    </template>
                  </el-input>
                </el-form-item>

                <el-form-item label-width="0px">
                  <el-row class="options-row">
                    <el-col v-if="isSceBackend">
                      <span class="form-hint">SubConverter-Extended 的开关参数在「SCE 参数」中设置</span>
                    </el-col>
                    <template v-else>
                      <el-col>
                        <el-checkbox v-model="form.nodeList" border>输出为 Node List</el-checkbox>
                      </el-col>
                      <el-popover placement="bottom" trigger="click" v-model:visible="form.extraset">
                        <template #reference>
                          <el-button>更多选项</el-button>
                        </template>
                        <el-row>
                          <el-checkbox v-model="form.emoji">Emoji</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.scv">跳过证书验证</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox :model-value="form.udp === true" @change="form.udp = $event">启用 UDP</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.appendType">节点类型</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.sort">排序节点</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.fdn">过滤非法节点</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.expand">规则展开</el-checkbox>
                        </el-row>
                      </el-popover>
                      <el-popover placement="bottom" trigger="click">
                        <template #reference>
                          <el-button style="margin-left: 10px">定制功能</el-button>
                        </template>
                        <el-row>
                          <el-checkbox v-model="form.tpl.surge.doh">Surge.DoH</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.tpl.clash.doh">Clash.DoH</el-checkbox>
                        </el-row>
                        <el-row>
                          <el-checkbox v-model="form.insert">网易云</el-checkbox>
                        </el-row>
                      </el-popover>
                    </template>
                    <el-popover placement="top-end" title="添加自定义转换参数" trigger="hover">
                      <template #reference>
                        <el-button @click="addCustomParam" style="margin-left: 10px">
                          <el-icon><Plus /></el-icon>
                        </el-button>
                      </template>
                      <el-link type="primary" :href="subDocAdvanced" target="_blank" :icon="InfoFilled">参考文档</el-link>
                    </el-popover>
                  </el-row>
                </el-form-item>
              </div>

              <div style="margin-top: 50px"></div>

              <el-divider content-position="center">
                <el-icon><MagicStick /></el-icon>
              </el-divider>

              <el-form-item label="定制订阅:">
                <el-input class="copy-content" disabled :model-value="customSubUrl">
                  <template #append>
                    <el-button :icon="DocumentCopy" @click="copyToClipboard(customSubUrl)">复制</el-button>
                  </template>
                </el-input>
              </el-form-item>
              <el-form-item label="订阅短链:">
                <el-input class="copy-content" disabled :model-value="curtomShortSubUrl">
                  <template #append>
                    <el-button :icon="DocumentCopy" @click="copyToClipboard(curtomShortSubUrl)">复制</el-button>
                  </template>
                </el-input>
              </el-form-item>

              <!-- 操作按钮组 -->
              <el-form-item class="actions-row" label-width="0px" style="margin-top: 40px">
                <el-button
                  :style="buttonStyle"
                  type="danger"
                  @click="makeUrlClick"
                  :disabled="!canGenerateUrl">
                  生成订阅链接
                </el-button>
                <el-button
                  :style="buttonStyle"
                  type="danger"
                  @click="makeShortUrlClick"
                  :loading="loading"
                  :disabled="!canGenerateShortUrl">
                  生成短链接
                </el-button>
              </el-form-item>

              <el-form-item class="actions-row" label-width="0px">
                <el-button
                  :style="buttonStyle"
                  type="primary"
                  @click="dialogUploadConfigVisible = true"
                  :icon="UploadFilled"
                  :loading="loading">
                  上传配置
                </el-button>
                <el-button
                  :style="buttonStyle"
                  type="primary"
                  @click="clashInstall"
                  :icon="Connection"
                  :disabled="!canImportClash">
                  一键导入 Clash
                </el-button>
              </el-form-item>

              <el-form-item class="actions-row" label-width="0px">
                <el-button
                  :style="{ width: '290px' }"
                  type="primary"
                  @click="dialogLoadConfigVisible = true"
                  :icon="CopyDocument"
                  :loading="loading">
                  从 URL 解析
                </el-button>
              </el-form-item>
            </el-form>
          </el-container>
        </el-card>
      </el-col>
    </el-row>

    <!-- 配置上传对话框 -->
    <ConfigUploadDialog
      v-model:visible="dialogUploadConfigVisible"
      :upload-config="uploadConfig"
      :result-url="uploadResultUrl"
      :loading="uploading"
      @cancel="handleUploadCancel"
      @confirm="handleConfigUpload"
    />

    <!-- URL解析对话框 -->
    <UrlParseDialog
      v-model:visible="dialogLoadConfigVisible"
      :load-config="loadConfig"
      :loading="parsing"
      @cancel="handleLoadCancel"
      @confirm="handleUrlParse"
    />

    <!-- 转换参数对话框 -->
    <el-dialog v-model="paramsDialogVisible" :title="isSceBackend ? 'SubConverter-Extended 参数' : '高级参数'"
      width="min(720px, 94vw)" append-to-body>
      <el-form class="params-form" label-width="170px" label-position="left">
        <template v-if="isSceBackend">
          <p class="form-hint">
            未设置的参数交给后端默认值。SubConverter-Extended 不支持 groups / ruleset / new_name，请通过远程配置定义代理组和规则集。
          </p>
          <p v-if="suppressedSceParamCount" class="form-hint">
            当前客户端不支持 {{ suppressedSceParamCount }} 项已填写参数，生成时将忽略
          </p>
          <el-form-item v-for="def in sceTextParams" :key="def.key" :label="def.label + ':'">
            <el-input v-model="form.sce[def.key]" :type="def.textarea ? 'textarea' : 'text'" :rows="2"
              :placeholder="def.placeholder" />
            <div v-if="def.hint" class="form-hint">{{ def.hint }}</div>
          </el-form-item>
          <div class="sce-switches">
            <div v-for="def in sceBooleanParams" :key="def.key" class="sce-switch">
              <span class="sce-switch-label">{{ def.label }}</span>
              <el-select v-model="form.sce[def.key]" :disabled="emojiDetailDisabled(def.key)" size="small">
                <el-option label="默认" value="" />
                <el-option label="开启" value="true" />
                <el-option label="关闭" value="false" />
              </el-select>
            </div>
          </div>
        </template>
        <template v-else>
          <el-form-item label="节点分组名:">
            <el-input v-model="form.group" placeholder="group：覆盖直接节点的分组名" />
          </el-form-item>
          <el-form-item label="更新间隔:">
            <el-input v-model="form.interval" placeholder="interval：托管配置更新间隔（秒）" />
          </el-form-item>
          <el-form-item label="QuanX 设备 ID:">
            <el-input v-model="form.devId" placeholder="dev_id" />
          </el-form-item>
          <el-form-item label="节点重命名:">
            <el-input v-model="form.rename" type="textarea" :rows="2" placeholder="rename：正则@替换，多个规则使用 ` 分隔" />
          </el-form-item>
          <el-form-item label="自定义代理组:">
            <el-input v-model="form.groups" type="textarea" :rows="3"
              placeholder="groups：每行一个，格式同 custom_proxy_group，生成时自动 Base64 编码" />
          </el-form-item>
          <el-form-item label="自定义规则集:">
            <el-input v-model="form.ruleset" type="textarea" :rows="3"
              placeholder="ruleset：每行一个，格式同 ruleset，生成时自动 Base64 编码" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="paramsDialogVisible = false">完 成</el-button>
      </template>
    </el-dialog>

    <!-- SCE 诊断对话框 -->
    <el-dialog v-model="diagnostics.visible" title="SubConverter-Extended 诊断" width="min(820px, 94vw)" append-to-body>
      <p v-for="line in diagnosticsSummary" :key="line" class="diagnostics-line">{{ line }}</p>
      <pre class="diagnostics-json">{{ diagnosticsJson }}</pre>
      <template #footer>
        <el-button @click="copyToClipboard(diagnosticsJson)">复制 JSON</el-button>
        <el-button type="primary" @click="diagnostics.visible = false">关 闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { h } from 'vue';
import {
  Connection,
  CopyDocument,
  Delete,
  DocumentCopy,
  InfoFilled,
  Link,
  MagicStick,
  Plus,
  UploadFilled
} from '@element-plus/icons-vue';

// 导入配置
import { CONSTANTS } from '@/config/constants';
import { getClientTypes } from '@/config/client-types';
import { REMOTE_CONFIGS } from '@/config/remote-configs';
import { BACKEND_TYPES, BACKEND_LABELS, effectiveBackendType } from '@/config/backend-types';
import {
  availableSceTextParams,
  availableSceBooleanParams,
  countActiveSceParams,
  countSuppressedSceParams,
  isEmojiDetailDisabled
} from '@/config/sce-params';
import { validateSceParams } from '@/utils/validators';

// 导入Composables
import { useSubscriptionForm, addCustomParam, saveSubUrl as saveSubscriptionUrl } from '@/composables/useSubscriptionForm';
import { useSubscription } from '@/composables/useSubscription';
import { useGeneratedLinks } from '@/composables/useGeneratedLinks'

// 导入工具函数
import { getLocalStorageItem } from '@/utils/storage';
import { copyText } from '@/utils/clipboard';
import { formatErrorMessage } from '@/utils/formatters'
import {
  createSourceItem,
  parseSourceItems,
  serializeSourceItem,
  serializeSourceItems,
  serializePlainSourceItems,
  hasSourceModifiers,
  modifierAvailable,
  countSuppressedSourceModifiers,
  validateSourceItems
} from '@/utils/sourceModifiers'

// 导入服务
import { BackendService } from '@/services/backendService';
import { ShortUrlService } from '@/services/shortUrlService';
import { ConfigUploadService } from '@/services/configUploadService';

// 导入组件
import ConfigUploadDialog from '@/components/ConfigUploadDialog.vue';
import UrlParseDialog from '@/components/UrlParseDialog.vue';

export default {
  name: 'Subconverter',
  components: {
    ConfigUploadDialog,
    UrlParseDialog,
    MagicStick,
    Plus
  },
  data() {
    const subscriptionForm = useSubscriptionForm();

    return {
      // 配置选项
      options: {
        backendOptions: [{ value: CONSTANTS.DEFAULT_BACKEND || "http://127.0.0.1:25500/sub?" }],
        remoteConfig: REMOTE_CONFIGS
      },

      // 状态
      backendVersion: "",
      backendInfo: null,
      backendTypeOverride: "",
      backendLabels: BACKEND_LABELS,
      backendTypeChoices: [BACKEND_TYPES.SCE, BACKEND_TYPES.FEIYANG, BACKEND_TYPES.LEGACY],
      lastClientTypeByFamily: {},
      sourceItems: [createSourceItem()],
      paramsDialogVisible: false,
      diagnostics: { visible: false, loading: false, result: null },
      generatedLinks: useGeneratedLinks(),
      uploading: false,
      parsing: false,
      dialogUploadConfigVisible: false,
      loadConfig: "",
      dialogLoadConfigVisible: false,
      uploadConfig: "",
      uploadResultUrl: "",
      subDocAdvanced: CONSTANTS.DOC_ADVANCED,

      // 是否为 PC 端
      isPC: true,

      // 合并表单状态
      ...subscriptionForm
    };
  },
  computed: {
    // 图标组件经 computed 暴露，避免放入 data 被转换为响应式对象
    Connection() {
      return Connection;
    },

    CopyDocument() {
      return CopyDocument;
    },

    Delete() {
      return Delete;
    },

    DocumentCopy() {
      return DocumentCopy;
    },

    InfoFilled() {
      return InfoFilled;
    },

    Link() {
      return Link;
    },

    Plus() {
      return Plus;
    },

    UploadFilled() {
      return UploadFilled;
    },

    // 按钮统一样式
    buttonStyle() {
      return { width: '140px' };
    },

    canGenerateShortUrl() {
      return this.customSubUrl.length > 0 && !this.loading;
    },

    canGenerateUrl() {
      return this.form.sourceSubUrl.length > 0 && this.form.clientType;
    },

    canImportClash() {
      return this.customSubUrl.length > 0;
    },

    customSubUrl() {
      return this.generatedLinks.longUrl
    },

    curtomShortSubUrl() {
      return this.generatedLinks.shortUrl
    },

    loading() {
      return this.uploading || this.parsing || this.generatedLinks.pending
    },

    // 手动选择优先；未识别的后端按原版 subconverter 处理
    backendType() {
      return this.backendTypeOverride || effectiveBackendType(this.backendInfo?.family)
    },

    isSceBackend() {
      return this.backendType === BACKEND_TYPES.SCE
    },

    autoBackendLabel() {
      const family = this.backendInfo?.family
      return family ? `自动识别（${BACKEND_LABELS[family]}）` : '自动识别（未连接，按原版处理）'
    },

    backendMismatch() {
      const family = this.backendInfo?.family
      return Boolean(this.backendTypeOverride && family && family !== BACKEND_TYPES.UNKNOWN &&
        family !== this.backendTypeOverride)
    },

    clientTypeOptions() {
      return getClientTypes(this.backendType)
    },

    sourceEditorActive() {
      return this.isSceBackend && this.advanced === '2'
    },

    suppressedSourceModifierCount() {
      return countSuppressedSourceModifiers(this.sourceItems, this.form.clientType)
    },

    sceTextParams() {
      return availableSceTextParams(this.form.clientType)
    },

    sceBooleanParams() {
      return availableSceBooleanParams(this.form.clientType)
    },

    suppressedSceParamCount() {
      return countSuppressedSceParams(this.form.sce, this.form.clientType)
    },

    activeParamCount() {
      if (this.isSceBackend) return countActiveSceParams(this.form.sce, this.form.clientType)
      return ['group', 'interval', 'devId', 'rename', 'groups', 'ruleset']
        .filter(field => String(this.form[field] || '').trim()).length
    },

    diagnosticsJson() {
      return this.diagnostics.result ? JSON.stringify(this.diagnostics.result, null, 2) : ''
    },

    diagnosticsSummary() {
      const result = this.diagnostics.result
      if (!result || typeof result !== 'object') return []
      const lines = [`状态：${result.ok ? '成功' : '失败'}${result.status_code ? `（HTTP ${result.status_code}）` : ''}`]
      if (result.target) lines.push(`目标：${result.target}`)
      if (result.nodes) {
        const { total, generated, unsupported } = result.nodes
        lines.push(`节点：共 ${total ?? '-'}，生成 ${generated ?? '-'}，不支持 ${unsupported ?? '-'}`)
      }
      if (result.output) {
        lines.push(`输出：${result.output.bytes ?? '-'} 字节，Provider ${result.output.provider_count ?? 0} 个`)
      }
      if (result.message || result.error) lines.push(`信息：${result.message || result.error}`)
      return lines
    }
  },
  watch: {
    dialogUploadConfigVisible(visible) {
      if (!visible) {
        this.uploadResultUrl = "";
      }
    },

    'form.customBackend'() {
      clearTimeout(this.probeTimer);
      this.probeTimer = setTimeout(() => this.probeBackend(), 600);
    },

    backendType(type, previous) {
      this.lastClientTypeByFamily[previous] = this.form.clientType;
      const targets = Object.values(getClientTypes(type));
      if (!targets.includes(this.form.clientType)) {
        const remembered = this.lastClientTypeByFamily[type];
        this.form.clientType = targets.includes(remembered) ? remembered
          : targets.includes(CONSTANTS.DEFAULT_CLIENT_TYPE) ? CONSTANTS.DEFAULT_CLIENT_TYPE : targets[0];
      }
      // 来源前缀只有 SubConverter-Extended 识别，离开时去掉以免传统后端解析失败
      if (previous === BACKEND_TYPES.SCE) {
        const items = parseSourceItems(this.form.sourceSubUrl);
        if (hasSourceModifiers(items)) this.form.sourceSubUrl = serializePlainSourceItems(items);
      }
    },

    sourceEditorActive(active) {
      if (active) this.syncSourceItemsFromForm();
    },

    sourceItems: {
      deep: true,
      handler(items) {
        if (this.sourceEditorActive) {
          this.form.sourceSubUrl = items.map(item => serializeSourceItem(item)).filter(Boolean).join('\n');
        }
      }
    },

    'form.sce.emoji'(value) {
      if (value !== '') {
        this.form.sce.addEmoji = '';
        this.form.sce.removeEmoji = '';
      }
    }
  },
  created() {
    document.title = "Subscription Converter";
    this.isPC = this.$getOS().isPc;

    // 获取 url cache
    if (CONSTANTS.USE_STORAGE) {
      const cachedUrl = getLocalStorageItem('sourceSubUrl');
      if (cachedUrl) {
        this.form.sourceSubUrl = cachedUrl;
      }
    }
  },
  mounted() {
    this.form.clientType = CONSTANTS.DEFAULT_CLIENT_TYPE;
    this.probeBackend();

    // 延迟加载隐私提示，避免阻塞页面初始化
    this.notifyTimer = setTimeout(() => {
      this.notify();
    }, 1000);
  },
  beforeUnmount() {
    clearTimeout(this.notifyTimer);
    clearTimeout(this.probeTimer);
  },
  methods: {
    async copyToClipboard(text, successMessage = "Copied!") {
      if (!text) {
        return false;
      }

      const copied = await copyText(text);
      if (copied) {
        this.$message.success(successMessage);
      } else {
        this.$message.error("复制失败，请手动选中链接复制");
      }

      return copied;
    },

    goToProject() {
      window.open(CONSTANTS.PROJECT);
    },

    gotoGayhub() {
      window.open(CONSTANTS.BACKEND_RELEASE);
    },

    clashInstall() {
      if (this.customSubUrl === "") {
        this.$message.error("请先填写必填项，生成订阅链接")
        return false
      }

      window.open('clash://install-config?url=' + encodeURIComponent(this.generatedLinks.importUrl))
    },

    // 返回 { url } 或 { error }，按当前后端类型校验并生成
    buildSubUrl() {
      let form = this.form
      if (this.isSceBackend) {
        this.syncSourceItemsFromForm()
        const error = validateSceParams(this.form.sce, this.form.clientType)
        if (error) return { error }
        if (this.form.sourceSubUrl.trim()) {
          const items = parseSourceItems(this.form.sourceSubUrl)
          const sourceError = validateSourceItems(items, this.form.clientType)
          if (sourceError) return { error: sourceError }
          const sources = serializeSourceItems(items, this.form.clientType)
          form = { ...this.form, sourceSubUrl: sources }
        }
      }
      const url = this.makeUrl(form, this.advanced, this.customParams, this.backendType)
      return url ? { url } : { error: "订阅链接与客户端为必填项" }
    },

    makeUrlClick() {
      const { url, error } = this.buildSubUrl()
      if (url) {
        this.generatedLinks.setLongUrl(url)
        this.copyToClipboard(this.customSubUrl, "定制订阅已复制到剪贴板")
      } else {
        this.$message.error(error)
      }
    },

    async runDiagnostics() {
      const { url, error } = this.buildSubUrl()
      if (!url) {
        this.$message.error(error)
        return
      }
      this.diagnostics.loading = true
      try {
        this.diagnostics.result = await BackendService.explain(this.$axios, url)
        this.diagnostics.visible = true
      } catch (e) {
        this.$message.error('诊断失败：' + formatErrorMessage(e.cause || e))
      } finally {
        this.diagnostics.loading = false
      }
    },

    sourceModifierAvailable(key, item) {
      return modifierAvailable(key, this.form.clientType, item.url)
    },

    emojiDetailDisabled(key) {
      return isEmojiDetailDisabled(this.form.sce, key)
    },

    createSourceItem() {
      return createSourceItem()
    },

    syncSourceItemsFromForm() {
      const items = parseSourceItems(this.form.sourceSubUrl)
      this.sourceItems = items.length ? items : [createSourceItem()]
    },

    async makeShortUrlClick() {
      if (this.customSubUrl === '') {
        this.$message.warning('请先生成订阅链接，再获取对应短链接')
        return false
      }
      try {
        const shortUrl = await this.generatedLinks.shorten(
          url => ShortUrlService.generateShortUrl(this.$axios, url)
        )
        if (shortUrl) await this.copyToClipboard(shortUrl, '短链接已复制到剪贴板')
      } catch (error) {
        this.$message.error('短链接获取失败：' + formatErrorMessage(error))
      }
    },

    async confirmUploadConfig() {
      if (this.uploading) return
      if (this.uploadConfig.trim() === '') {
        this.$message.warning('远程配置不能为空')
        return false
      }
      this.uploading = true
      try {
        const result = await ConfigUploadService.uploadConfig(this.$axios, this.uploadConfig, copyText)
        this.form.remoteConfig = result.url
        if (result.copied) {
          this.$message.success('远程配置上传成功，配置链接已复制到剪贴板，有效期三个月望知悉')
          this.dialogUploadConfigVisible = false
          this.uploadConfig = ''
          this.uploadResultUrl = ''
        } else {
          this.$message.error('复制失败，请手动选中链接复制')
          this.uploadResultUrl = result.url
        }
      } catch (error) {
        this.$message.error('远程配置上传失败: ' + formatErrorMessage(error))
      } finally {
        this.uploading = false
      }
    },

    handleUploadCancel() {
      if (this.uploading) return
      this.uploadConfig = ""
      this.uploadResultUrl = ""
      this.dialogUploadConfigVisible = false
    },

    handleConfigUpload(configContent) {
      if (this.uploading) return
      this.uploadConfig = configContent
      return this.confirmUploadConfig()
    },

    handleLoadCancel() {
      if (this.parsing) return
      this.loadConfig = ""
      this.dialogLoadConfigVisible = false
    },

    handleUrlParse(url) {
      if (this.parsing) return
      this.loadConfig = url
      return this.confirmLoadConfig()
    },

    async confirmLoadConfig() {
      if (this.parsing) return
      this.parsing = true
      try {
        const url = await ShortUrlService.resolveUrl(this.loadConfig)
        // 先识别链接所指后端，再按对应规则解析参数
        const info = this.parseUrl(url).success ? await BackendService.probeBackend(this.$axios, url) : null
        // 探测失败时保留当前后端类型，避免把 SCE 链接按 legacy 规则误解析
        const backendType = this.backendTypeOverride ||
          (info ? effectiveBackendType(info.family) : this.backendType)
        const result = this.parseUrl(url, backendType)
        if (!result.success) {
          this.$message.error(result.message)
          return false
        }
        // 已探测过该后端，避免 customBackend 的 watch 再次探测并覆盖结果
        this.probedBackend = result.form.customBackend
        if (info) this.applyBackendInfo(info)
        this.form = result.form
        this.customParams = result.customParams
        if (backendType === BACKEND_TYPES.SCE) this.syncSourceItemsFromForm()
        this.dialogLoadConfigVisible = false
        this.loadConfig = ''
        this.$message.success('长/短链接已成功解析为订阅信息')
        return true
      } catch (error) {
        this.$message.error(formatErrorMessage(error))
        return false
      } finally {
        this.parsing = false
      }
    },

    backendSearch(queryString, cb) {
      const results = this.backendSearchSuggestions(queryString, this.options.backendOptions);
      cb(results);
    },

    backendSearchSuggestions(queryString, backends) {
      if (queryString) {
        return backends.filter(backend => {
          return backend.value.toLowerCase().indexOf(queryString.toLowerCase()) === 0;
        });
      }
      return backends;
    },

    async probeBackend() {
      const backend = this.form.customBackend || CONSTANTS.DEFAULT_BACKEND;
      if (!backend || backend === this.probedBackend) return;
      this.probedBackend = backend;
      const info = await BackendService.probeBackend(this.$axios, backend);
      // 忽略已过期的探测结果
      if (backend === this.probedBackend) this.applyBackendInfo(info);
    },

    applyBackendInfo(info) {
      this.backendInfo = info;
      this.backendVersion = info ? info.version : "";
    },

    notify() {
      this.$notify({
        title: "隐私提示",
        type: "warning",
        message: h(
          "i",
          { style: "color: teal" },
          "各种订阅链接（短链接服务除外）生成纯前端实现，无隐私问题。默认提供后端转换服务，隐私担忧者请自行搭建后端服务。"
        )
      });
    },

    // 表单相关方法
    saveSubUrl() {
      saveSubscriptionUrl(this.form);
    },

    addCustomParam() {
      addCustomParam(this.customParams);
    },

    // 使用 composables
    ...useSubscription(CONSTANTS.DEFAULT_BACKEND)
  }
};
</script>

<style scoped>
/* el-form-item__content 在 Element Plus 中是 flex 容器，text-align 无法居中按钮 */
.actions-row :deep(.el-form-item__content) {
  justify-content: center;
}

/* el-form-item__content 为 flex 容器，行宽默认由内容撑开，需显式占满 */
/* 同时覆盖 Element Plus 中 el-row 默认的 flex-wrap: wrap，保持选项与按钮同行 */
.options-row {
  width: 100%;
  flex-wrap: nowrap;
}

/* 占满剩余空间，将右侧选项按钮推至行尾 */
.options-row :deep(.el-col) {
  flex: 1;
}

.form-hint {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.source-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.source-modifiers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.source-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.sce-switches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px 16px;
}

.sce-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sce-switch .el-select {
  width: 90px;
  flex-shrink: 0;
}

.diagnostics-line {
  margin: 0 0 4px;
}

.diagnostics-json {
  max-height: 50vh;
  overflow: auto;
  padding: 10px;
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 窄屏下标签置顶，避免 140px 标签和 append 按钮挤压输入框 */
@media (max-width: 640px) {
  .subconverter-form :deep(.el-form-item) {
    display: block;
  }

  .subconverter-form :deep(.el-form-item__label) {
    width: auto !important;
    height: auto;
    line-height: 1.5;
    justify-content: flex-start;
    padding: 0 0 4px;
  }

  .subconverter-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .actions-row :deep(.el-form-item__content) {
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions-row :deep(.el-button) {
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .backend-link-text {
    display: none;
  }
}
</style>
