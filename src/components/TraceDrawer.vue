<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { TraceDetail } from '../types'

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
// 简易 JSON 语法高亮
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
          <!-- Trace 基本信息 -->
          <div class="trace-info">
            <div class="info-item">
              <span class="info-label">耗时</span>
              <span class="info-value">{{ detail.trace.latency?.toFixed(1) }}秒</span>
            </div>
            <div class="info-item">
              <span class="info-label">观测数</span>
              <span class="info-value">{{ detail.observations.length }}</span>
            </div>
            <div class="info-item" v-if="detail.observations.length">
              <span class="info-label">总 Token</span>
              <span class="info-value">
                {{ detail.observations.reduce((a, o) => a + (o.totalTokens || 0), 0).toLocaleString() }}
              </span>
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
              <div class="obs-node-header" @click="expandedKeys.includes(obs.id) ? expandedKeys = expandedKeys.filter(k => k !== obs.id) : expandedKeys.push(obs.id)">
                <span class="obs-icon">{{ typeIcon(obs.type) }}</span>
                <span class="obs-name">{{ obs.name || '(无名)' }}</span>
                <a-tag :color="typeColor(obs.type)" class="obs-type-tag">{{ obs.type }}</a-tag>
                <a-tag v-if="obs.model" class="obs-model-tag">{{ obs.model }}</a-tag>
                <span v-if="obs.latency" class="obs-latency">⏱ {{ obs.latency.toFixed(1) }}s</span>
                <span v-if="obs.totalTokens" class="obs-tokens">
                  🔤 {{ obs.totalTokens.toLocaleString() }}
                </span>
                <a-tag v-if="obs.level === 'ERROR'" color="red" class="obs-error-tag">错误</a-tag>
                <span class="expand-arrow" :class="{ 'expanded': expandedKeys.includes(obs.id) }">▸</span>
              </div>

              <!-- 节点详情 -->
              <transition name="expand">
                <div v-if="expandedKeys.includes(obs.id) && (obs.type === 'GENERATION' || obs.input || obs.output)" class="obs-detail">
                  <div v-if="obs.input" class="io-block">
                    <div class="io-label">📥 Input</div>
                    <pre class="io-content" v-html="highlightJson(formatContent(obs.input))"></pre>
                  </div>
                  <div v-if="obs.output" class="io-block">
                    <div class="io-label">📤 Output</div>
                    <pre class="io-content" v-html="highlightJson(formatContent(obs.output))"></pre>
                  </div>
                  <div v-if="obs.metadata && Object.keys(obs.metadata).length" class="io-block">
                    <div class="io-label">📋 Metadata</div>
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

/* Trace 信息条 */
.trace-info {
  display: flex;
  gap: 24px;
  padding: 14px 16px;
  background: var(--primary-bg);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
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
.obs-latency {
  color: var(--text-tertiary); font-size: 12px;
  margin-left: auto;
}
.obs-tokens {
  color: var(--primary); font-size: 12px; font-weight: 600;
}
.obs-error-tag { margin: 0; font-size: 11px; }
.expand-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
  transition: transform 0.2s;
}
.expand-arrow.expanded { transform: rotate(90deg); }

/* 节点详情 */
.obs-detail { padding: 0 14px 12px 14px; }
.io-block { margin-top: 8px; }
.io-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.io-content {
  background: #F7F8FA;
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.7;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', ui-monospace, 'Menlo', 'Consolas', monospace;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  margin: 0;
}
.io-meta { max-height: 150px; }

/* JSON 语法高亮 */
:deep(.json-key) { color: #C792EA; }
:deep(.json-string) { color: #C3E88D; }
:deep(.json-number) { color: #F78C6C; }
:deep(.json-boolean) { color: #FF9CAC; }
:deep(.json-null) { color: var(--text-tertiary); }

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
  .obs-latency { margin-left: 0; }
}
</style>
