<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { TraceDetail, TokenBreakdown } from '../types'

const props = defineProps<{ traceId: string; open: boolean }>()
const emit = defineEmits<{ 'update:open': [val: boolean] }>()

const { fetchTraceDetail } = useLangfuse()
const loading = ref(false)
const detail = ref<TraceDetail | null>(null)
const expandedKeys = ref<string[]>([])
const expandAll = ref(true)

// 抽屉宽度自适应
const isMobile = ref(false)
function checkBreakpoint() {
  isMobile.value = window.innerWidth <= 768
}
onMounted(() => {
  checkBreakpoint()
  window.addEventListener('resize', checkBreakpoint)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkBreakpoint)
})
const drawerWidth = computed(() => (isMobile.value ? '100%' : 720))

watch(
  () => [props.traceId, props.open],
  async ([id, open]) => {
    if (!open || !id) return
    loading.value = true
    detail.value = null
    expandAll.value = true
    try {
      detail.value = await fetchTraceDetail(id as string)
      expandedKeys.value = (detail.value.observations || [])
        .filter((o) => o.type === 'GENERATION')
        .map((o) => o.id)
    } catch (e: any) {
      console.error(e)
    } finally {
      loading.value = false
    }
  }
)

function toggleExpandAll() {
  if (!detail.value) return
  if (expandAll.value) {
    expandedKeys.value = []
    expandAll.value = false
  } else {
    expandedKeys.value = detail.value.observations.map((o) => o.id)
    expandAll.value = true
  }
}

function toggleObs(obsId: string) {
  expandedKeys.value = expandedKeys.value.includes(obsId)
    ? expandedKeys.value.filter((k) => k !== obsId)
    : [...expandedKeys.value, obsId]
}

// ---- 展示辅助 ----

const EMPTY_TOKENS: TokenBreakdown = {
  input: 0, cache: 0, totalInput: 0, output: 0, reasoning: 0, totalOutput: 0, total: 0,
}
const traceTokens = computed<TokenBreakdown>(() => detail.value?.trace?.usage || EMPTY_TOKENS)

/** 耗时格式化：0.0秒 → 42.3秒 / 8分37秒 / 1小时3分 */
function formatDuration(sec: number | undefined): string {
  if (!sec || sec <= 0) return '-'
  if (sec < 60) return `${sec.toFixed(1)}秒`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m < 60) return s ? `${m}分${s}秒` : `${m}分`
  const h = Math.floor(m / 60)
  return `${h}小时${m % 60}分`
}

/** 紧凑 token 数：节点头部 chip 用（26,192 → 26.2k） */
function fmtCompact(n: number | undefined): string {
  const v = n || 0
  if (v >= 100000) return `${Math.round(v / 1000)}k`
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`
  return v.toLocaleString()
}

/** 完整 token 数：明细区用 */
function fmtFull(n: number | undefined): string {
  return (n || 0).toLocaleString()
}

/** 输入缓存命中率 */
const cacheHitRate = computed(() => {
  const t = traceTokens.value
  if (!t.totalInput) return null
  return Math.round((t.cache / t.totalInput) * 1000) / 10
})

async function copyContent(data: any) {
  const text = formatContent(data)
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function typeColor(type: string) {
  return { TRACE: 'blue', SPAN: 'cyan', GENERATION: 'green' }[type] || 'default'
}
function typeIcon(type: string) {
  return { TRACE: '🎯', SPAN: '📍', GENERATION: '🤖' }[type] || '•'
}
function typeBorderColor(type: string) {
  return { TRACE: '#1890FF', SPAN: '#13C2C2', GENERATION: '#52C41A', EVENT: '#BFBFBF' }[type] || '#BFBFBF'
}
function formatContent(data: any): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
// 简易 JSON 语法高亮（浅色主题配色，保证可读性）
function highlightJson(jsonStr: string): string {
  if (!jsonStr) return ''
  // 转义 HTML
  const escaped = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+\.?\d*([eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'json-key' : 'json-string'
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean'
      } else if (/null/.test(match)) {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}
</script>

<template>
  <a-drawer
    :open="open"
    @update:open="emit('update:open', $event)"
    :width="drawerWidth"
    placement="right"
    :body-style="{ padding: '0' }"
  >
    <template #title>
      <div class="drawer-title">
        <span class="drawer-title-text">{{ detail?.trace?.name || '加载中...' }}</span>
        <a-tag v-if="detail" color="blue" class="drawer-title-count">
          {{ detail.observations.length }} 个节点
        </a-tag>
      </div>
    </template>

    <div class="drawer-body">
      <a-spin :spinning="loading">
        <template v-if="detail">
          <!-- Trace 快速指标 -->
          <div class="trace-info">
            <div class="info-item">
              <span class="info-label">耗时</span>
              <span class="info-value">{{ formatDuration(detail.trace.latency) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">观测数</span>
              <span class="info-value">{{ detail.observations.length }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">总 Token</span>
              <span class="info-value">{{ fmtFull(traceTokens.total) }}</span>
            </div>
          </div>

          <!-- Token 六项明细 -->
          <div class="token-panel">
            <div class="token-panel-header">
              <span class="token-panel-title">🔤 Token 明细</span>
              <a-tag v-if="cacheHitRate !== null && cacheHitRate > 0" color="green" class="cache-rate-tag">
                ⚡ 缓存命中 {{ cacheHitRate }}%
              </a-tag>
            </div>
            <div class="token-grid">
              <div class="token-cell">
                <span class="token-label">输入</span>
                <span class="token-num">{{ fmtFull(traceTokens.input) }}</span>
              </div>
              <div class="token-cell">
                <span class="token-label">输入缓存</span>
                <span class="token-num token-cache">{{ fmtFull(traceTokens.cache) }}</span>
              </div>
              <div class="token-cell token-sum">
                <span class="token-label">总输入</span>
                <span class="token-num">{{ fmtFull(traceTokens.totalInput) }}</span>
              </div>
              <div class="token-cell">
                <span class="token-label">输出</span>
                <span class="token-num">{{ fmtFull(traceTokens.output) }}</span>
              </div>
              <div class="token-cell">
                <span class="token-label">思考</span>
                <span class="token-num token-think">{{ fmtFull(traceTokens.reasoning) }}</span>
              </div>
              <div class="token-cell token-sum">
                <span class="token-label">总输出</span>
                <span class="token-num">{{ fmtFull(traceTokens.totalOutput) }}</span>
              </div>
            </div>
          </div>

          <!-- 调用链标题栏 -->
          <div class="chain-header">
            <span class="chain-title">调用链</span>
            <a-button size="small" type="text" @click="toggleExpandAll" class="expand-toggle">
              {{ expandAll ? '收起全部' : '展开全部' }}
            </a-button>
          </div>

          <!-- Observations 节点列表 -->
          <div class="obs-list">
            <div
              v-for="obs in detail.observations"
              :key="obs.id"
              class="obs-node"
              :style="{ '--type-color': typeBorderColor(obs.type) }"
            >
              <!-- 节点头部 -->
              <div class="obs-node-header" @click="toggleObs(obs.id)">
                <span class="obs-icon">{{ typeIcon(obs.type) }}</span>
                <span class="obs-name">{{ obs.name || '(无名)' }}</span>
                <a-tag :color="typeColor(obs.type)" class="obs-type-tag">{{ obs.type }}</a-tag>
                <a-tag v-if="obs.model" class="obs-model-tag">{{ obs.model }}</a-tag>
                <a-tag v-if="obs.level === 'ERROR'" color="red" class="obs-error-tag">错误</a-tag>
                <span class="expand-arrow" :class="{ 'expanded': expandedKeys.includes(obs.id) }">▸</span>
                <span class="obs-metrics">
                  <span v-if="obs.latency" class="obs-latency">⏱ {{ obs.latency.toFixed(1) }}s</span>
                  <span v-if="obs.usage.totalInput" class="obs-tokens in">📥 {{ fmtCompact(obs.usage.totalInput) }}</span>
                  <span v-if="obs.usage.cache" class="obs-tokens cache">⚡{{ fmtCompact(obs.usage.cache) }}</span>
                  <span v-if="obs.usage.totalOutput" class="obs-tokens out">📤 {{ fmtCompact(obs.usage.totalOutput) }}</span>
                  <span v-if="obs.usage.reasoning" class="obs-tokens think">🧠{{ fmtCompact(obs.usage.reasoning) }}</span>
                </span>
              </div>

              <!-- 节点详情 -->
              <transition name="expand">
                <div v-if="expandedKeys.includes(obs.id) && (obs.type === 'GENERATION' || obs.input || obs.output)" class="obs-detail">
                  <!-- 节点级 token 明细 -->
                  <div v-if="obs.usage.total" class="obs-token-detail">
                    <div class="otd-item">
                      <span class="otd-num">{{ fmtFull(obs.usage.input) }}</span>
                      <span class="otd-label">输入</span>
                    </div>
                    <div class="otd-item">
                      <span class="otd-num otd-cache">{{ fmtFull(obs.usage.cache) }}</span>
                      <span class="otd-label">输入缓存</span>
                    </div>
                    <div class="otd-item otd-sum">
                      <span class="otd-num">{{ fmtFull(obs.usage.totalInput) }}</span>
                      <span class="otd-label">总输入</span>
                    </div>
                    <div class="otd-item">
                      <span class="otd-num">{{ fmtFull(obs.usage.output) }}</span>
                      <span class="otd-label">输出</span>
                    </div>
                    <div class="otd-item">
                      <span class="otd-num otd-think">{{ fmtFull(obs.usage.reasoning) }}</span>
                      <span class="otd-label">思考</span>
                    </div>
                    <div class="otd-item otd-sum">
                      <span class="otd-num">{{ fmtFull(obs.usage.totalOutput) }}</span>
                      <span class="otd-label">总输出</span>
                    </div>
                  </div>
                  <div v-if="obs.input" class="io-block">
                    <div class="io-label-row">
                      <span class="io-label">📥 Input</span>
                      <a-button size="small" type="text" class="io-copy" @click.stop="copyContent(obs.input)">复制</a-button>
                    </div>
                    <pre class="io-content" v-html="highlightJson(formatContent(obs.input))"></pre>
                  </div>
                  <div v-if="obs.output" class="io-block">
                    <div class="io-label-row">
                      <span class="io-label">📤 Output</span>
                      <a-button size="small" type="text" class="io-copy" @click.stop="copyContent(obs.output)">复制</a-button>
                    </div>
                    <pre class="io-content" v-html="highlightJson(formatContent(obs.output))"></pre>
                  </div>
                  <div v-if="obs.metadata && Object.keys(obs.metadata).length" class="io-block">
                    <div class="io-label-row">
                      <span class="io-label">📋 Metadata</span>
                      <a-button size="small" type="text" class="io-copy" @click.stop="copyContent(obs.metadata)">复制</a-button>
                    </div>
                    <pre class="io-content io-meta" v-html="highlightJson(formatContent(obs.metadata))"></pre>
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </template>

        <!-- 加载中 -->
        <div v-else-if="loading" class="drawer-placeholder">
          <a-spin tip="正在加载调用链..." />
        </div>

        <!-- 空状态 -->
        <div v-else class="drawer-placeholder">
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">暂无数据</div>
          </div>
        </div>
      </a-spin>
    </div>
  </a-drawer>
</template>

<style scoped>
.drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.drawer-title-text {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}
.drawer-title-count { font-size: 12px; }

.drawer-body {
  padding: 16px 20px;
}

/* Trace 快速指标 */
.trace-info {
  display: flex;
  gap: 32px;
  padding: 14px 16px;
  background: var(--primary-bg);
  border-radius: var(--radius-md);
  margin-bottom: 12px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-label {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.info-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

/* Token 六项明细面板 */
.token-panel {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 20px;
  background: var(--card-bg);
}
.token-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.token-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.cache-rate-tag { font-size: 12px; margin: 0; }
.token-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.token-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  border: 1px solid var(--border-light);
}
.token-cell.token-sum {
  background: var(--primary-bg);
  border-color: transparent;
}
.token-label {
  font-size: 11px;
  color: var(--text-tertiary);
}
.token-num {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere; /* 长数字窄屏下允许断行，避免溢出单元格 */
}
.token-cache { color: var(--success); }
.token-think { color: #9254DE; }

/* 调用链标题 */
.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.chain-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.expand-toggle {
  font-size: 12px;
  color: var(--primary) !important;
}

/* 节点列表 */
.obs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.obs-node {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  border-left: 3px solid var(--type-color);
  background: var(--card-bg);
  transition: box-shadow 0.2s;
}
.obs-node:hover { box-shadow: var(--shadow-sm); }

.obs-node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.obs-node-header:hover { background: var(--card-bg-hover); }
.obs-icon { font-size: 15px; }
.obs-name { font-weight: 600; color: var(--text-primary); }
.obs-type-tag { margin: 0; font-size: 11px; }
.obs-model-tag {
  margin: 0; font-size: 11px;
  background: #F0F1F4 !important;
  border: none !important;
  color: var(--text-secondary) !important;
}
.obs-error-tag { margin: 0; font-size: 11px; }
.expand-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
  transition: transform 0.2s;
}
.expand-arrow.expanded { transform: rotate(90deg); }

/* 头部右侧指标（耗时 + token chips），箭头之后靠右 */
.obs-metrics {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}
.obs-latency {
  color: var(--text-tertiary); font-size: 12px;
}
.obs-tokens {
  font-size: 12px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.obs-tokens.in { color: #0958A8; }
.obs-tokens.out { color: #1A7F37; }
.obs-tokens.cache { color: var(--success); background: #F6FFED; padding: 1px 6px; border-radius: 999px; }
.obs-tokens.think { color: #9254DE; background: #F9F0FF; padding: 1px 6px; border-radius: 999px; }

/* 节点详情 */
.obs-detail { padding: 0 14px 12px 14px; }

/* 节点级 token 明细条 */
.obs-token-detail {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin-top: 10px;
  padding: 10px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
}
.otd-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.otd-num {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.otd-cache { color: var(--success); }
.otd-think { color: #9254DE; }
.otd-sum .otd-num { color: #0958A8; }
.otd-label {
  font-size: 10px;
  color: var(--text-tertiary);
}

.io-block { margin-top: 8px; }
.io-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.io-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.io-copy {
  font-size: 12px;
  color: var(--text-tertiary) !important;
  padding: 0 6px;
  height: 22px;
}
.io-copy:hover { color: var(--primary) !important; }
.io-content {
  background: #F6F8FA;
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.75;
  max-height: 480px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', ui-monospace, 'Menlo', 'Consolas', monospace;
  color: #24292F;
  border: 1px solid #D8DEE4;
  margin: 0;
}
.io-meta { max-height: 150px; }

/* JSON 语法高亮 —— 浅色主题高对比配色 */
:deep(.json-key) { color: #6F42C1; font-weight: 600; }
:deep(.json-string) { color: #1A7F37; }
:deep(.json-number) { color: #B35900; }
:deep(.json-boolean) { color: #CF222E; }
:deep(.json-null) { color: #57606A; }

/* 展开/收起动画 */
.expand-enter-active, .expand-leave-active {
  transition: all 0.2s ease;
  max-height: 1000px;
}
.expand-enter-from, .expand-leave-to {
  opacity: 0;
  max-height: 0;
}

/* 占位 */
.drawer-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}
.empty-state {
  text-align: center;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { color: var(--text-tertiary); font-size: 14px; }

/* 移动端 */
@media (max-width: 768px) {
  .drawer-body { padding: 12px; }
  .trace-info { gap: 16px; padding: 12px; }
  .info-value { font-size: 16px; }
  .token-grid { gap: 6px; }
  .token-cell { padding: 6px 8px; }
  .token-num { font-size: 13px; }
  .obs-token-detail { grid-template-columns: repeat(3, 1fr); row-gap: 10px; }
  .obs-metrics { margin-left: 0; width: 100%; }
}
</style>
