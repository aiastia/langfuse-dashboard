<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { TraceDetail, SlimObservation } from '../types'

const props = defineProps<{ traceId: string; open: boolean }>()
const emit = defineEmits<{ 'update:open': [val: boolean] }>()

const { fetchTraceDetail } = useLangfuse()
const loading = ref(false)
const detail = ref<TraceDetail | null>(null)
const expandedKeys = ref<string[]>([])

// 抽屉宽度自适应：窄屏全屏，宽屏固定 680
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
const drawerWidth = computed(() => (isMobile.value ? '100%' : 680))

watch(
  () => [props.traceId, props.open],
  async ([id, open]) => {
    if (!open || !id) return
    loading.value = true
    detail.value = null
    try {
      detail.value = await fetchTraceDetail(id as string)
      // 默认展开所有 GENERATION（方便直接看 input/output）
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

function typeColor(type: string) {
  return { TRACE: 'blue', SPAN: 'cyan', GENERATION: 'green' }[type] || 'default'
}
function typeIcon(type: string) {
  return { TRACE: '🎯', SPAN: '📍', GENERATION: '🤖' }[type] || '•'
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
function truncContent(data: any, max = 200): string {
  const s = formatContent(data)
  return s.length > max ? s.slice(0, max) + '...' : s
}
</script>

<template>
  <a-drawer
    :open="open"
    @update:open="emit('update:open', $event)"
    :width="drawerWidth"
    :title="detail?.trace?.name || '加载中...'"
    placement="right"
  >
    <a-spin :spinning="loading">
      <template v-if="detail">
        <!-- Trace 基本信息 -->
        <a-descriptions :column="2" size="small" bordered style="margin-bottom: 16px;">
          <a-descriptions-item label="任务">{{ detail.trace.name }}</a-descriptions-item>
          <a-descriptions-item label="耗时">{{ detail.trace.latency?.toFixed(1) }}秒</a-descriptions-item>
          <a-descriptions-item label="runner">{{ detail.trace.runner || '-' }}</a-descriptions-item>
          <a-descriptions-item label="用户/项目">{{ detail.trace.userId }} / {{ detail.trace.projectId }}</a-descriptions-item>
          <a-descriptions-item label="章号" v-if="detail.trace.chapterNumber">{{ detail.trace.chapterNumber }}</a-descriptions-item>
          <a-descriptions-item label="观测数">{{ detail.observations.length }}</a-descriptions-item>
        </a-descriptions>

        <!-- Observations 列表 -->
        <div class="obs-section">
          <div class="obs-section-title">调用链（{{ detail.observations.length }} 个节点）</div>
          <a-collapse v-model:active-key="expandedKeys" :bordered="false">
            <a-collapse-panel
              v-for="obs in detail.observations"
              :key="obs.id"
              :show-arrow="obs.type === 'GENERATION' || !!obs.input || !!obs.output"
            >
              <template #header>
                <div class="obs-header">
                  <span class="obs-icon">{{ typeIcon(obs.type) }}</span>
                  <span class="obs-name">{{ obs.name || '(无名)' }}</span>
                  <a-tag :color="typeColor(obs.type)" size="small" style="margin-left:6px;">{{ obs.type }}</a-tag>
                  <a-tag v-if="obs.model" color="default" size="small">{{ obs.model }}</a-tag>
                  <span v-if="obs.latency" class="obs-latency">{{ obs.latency.toFixed(1) }}s</span>
                  <span v-if="obs.totalTokens" class="obs-tokens">
                    {{ obs.inputTokens }}→{{ obs.outputTokens }} tok
                  </span>
                  <a-tag v-if="obs.level === 'ERROR'" color="red" size="small">错误</a-tag>
                </div>
              </template>

              <!-- GENERATION 详情：input / output -->
              <div v-if="obs.type === 'GENERATION' || obs.input || obs.output" class="obs-detail">
                <div v-if="obs.input" class="io-block">
                  <div class="io-label">📥 Input</div>
                  <pre class="io-content">{{ formatContent(obs.input) }}</pre>
                </div>
                <div v-if="obs.output" class="io-block">
                  <div class="io-label">📤 Output</div>
                  <pre class="io-content">{{ formatContent(obs.output) }}</pre>
                </div>
                <div v-if="obs.metadata && Object.keys(obs.metadata).length" class="io-block">
                  <div class="io-label">📋 Metadata</div>
                  <pre class="io-content io-meta">{{ formatContent(obs.metadata) }}</pre>
                </div>
              </div>
              <div v-else class="obs-no-detail">无详细内容</div>
            </a-collapse-panel>
          </a-collapse>
        </div>
      </template>
      <a-empty v-else-if="!loading" description="暂无数据" />
    </a-spin>
  </a-drawer>
</template>

<style scoped>
.obs-section-title {
  font-size: 14px; font-weight: 600; color: #333; margin-bottom: 10px;
}
.obs-header {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px;
}
.obs-icon { font-size: 15px; }
.obs-name { font-weight: 500; color: #333; }
.obs-latency { color: #8c8c8c; font-size: 12px; }
.obs-tokens { color: #4D8088; font-size: 12px; font-weight: 500; }

.obs-detail { padding: 4px 0; }
.io-block { margin-bottom: 12px; }
.io-label {
  font-size: 12px; font-weight: 600; color: #8c8c8c; margin-bottom: 4px;
}
.io-content {
  background: #f7f6f2; border-radius: 6px; padding: 10px 12px;
  font-size: 12px; line-height: 1.6; max-height: 400px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, 'Menlo', 'Consolas', monospace;
  color: #595959; border: 1px solid #ebe7df;
}
.io-meta { max-height: 150px; }
.obs-no-detail { color: #bfbfbf; font-size: 12px; padding: 4px 0; }
:deep(.ant-collapse) { background: transparent; }
:deep(.ant-collapse-item) { border-bottom: 1px solid #f0ede6; }
:deep(.ant-collapse-header) { padding: 10px 12px !important; }
</style>
