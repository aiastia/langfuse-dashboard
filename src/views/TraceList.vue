<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { SlimTrace } from '../types'
import TraceDrawer from '../components/TraceDrawer.vue'

const { fetchTraces } = useLangfuse()
const loading = ref(false)
const traces = ref<SlimTrace[]>([])
const hasMore = ref(false)
const nextCursor = ref<string | null>(null)

const filters = reactive({
  name: '' as string,
  dateRange: [] as string[],
})

// 任务类型选项（从已加载数据动态提取）
const nameOptions = ref<string[]>([])

const selectedTraceId = ref('')
const drawerOpen = ref(false)

// 书名映射（项目ID → 书名），未知 ID 直接显示原数字
const BOOK_NAMES: Record<string, string> = {
  '31': '凶崽入门：全宗门跪求我别吞了',
  '32': '贫僧不走了',
  '28': '先婚厚爱是违约行为',
  '30': '当链路开始报心跳',
  '22': '抱着满月娃和离，渣夫跪晚了',
  '20': '这个房客有点甜',
  '23': '幽冥有美人',
  '15': '穿成恶毒女配后，全频道都能听到我的心声',
  '16': '那只狐妖总来蹭饭',
  '9': '转生后我的龙来砸我家门',
  '11': '双月法则：禁忌的第三序列',
}

function bookName(projectId: string | undefined) {
  if (!projectId) return ''
  return BOOK_NAMES[String(projectId)] || String(projectId)
}

const columns = [
  { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 160, customRender: ({ text }: any) => formatTime(text) },
  { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '用户', dataIndex: 'userId', key: 'userId', width: 80 },
  { title: '项目', dataIndex: 'projectId', key: 'projectId', width: 160, ellipsis: true },
  { title: '耗时(秒)', dataIndex: 'latency', key: 'latency', width: 100, customRender: ({ text }: any) => text?.toFixed(1) || '-' },
  { title: '观测数', dataIndex: 'observationCount', key: 'observationCount', width: 80 },
  { title: '章号', dataIndex: 'chapterNumber', key: 'chapterNumber', width: 80 },
]

function formatTime(iso: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load(reset = true) {
  loading.value = true
  if (reset) {
    traces.value = []
    nextCursor.value = null
  }
  try {
    const query: any = { limit: 50 }
    if (!reset && nextCursor.value) query.cursor = nextCursor.value
    if (filters.name) query.name = filters.name
    if (filters.dateRange?.length === 2) {
      query.fromTimestamp = new Date(filters.dateRange[0]).toISOString()
      query.toTimestamp = new Date(filters.dateRange[1] + 'T23:59:59').toISOString()
    }
    const res = await fetchTraces(query)
    if (reset) {
      traces.value = res.data
    } else {
      traces.value.push(...res.data)
    }
    nextCursor.value = res.meta.nextCursor
    hasMore.value = res.meta.hasMore
    // 提取任务类型选项
    const names = new Set(traces.value.map((t) => t.name))
    nameOptions.value = [...names]
  } catch (e: any) {
    message.error('数据加载失败，请重试')
    console.error(e)
  } finally {
    loading.value = false
  }
}

function loadMore() {
  load(false)
}

function onRowClick(record: SlimTrace) {
  selectedTraceId.value = record.id
  drawerOpen.value = true
}

onMounted(() => load(true))
</script>

<template>
  <a-card>
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-select
        v-model:value="filters.name"
        placeholder="任务类型"
        allow-clear
        class="filter-select"
        @change="load(true)"
      >
        <a-select-option v-for="n in nameOptions" :key="n" :value="n">{{ n }}</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filters.dateRange" @change="load(true)" />
      <a-button @click="load(true)">🔄 刷新</a-button>
    </div>

    <a-table
      class="desktop-table"
      :columns="columns"
      :data-source="traces"
      :loading="loading"
      :pagination="false"
      :row-key="(r: SlimTrace) => r.id"
      :scroll="{ x: 800 }"
      size="small"
      :custom-row="(record: SlimTrace) => ({ onClick: () => onRowClick(record) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a class="trace-name">{{ record.name }}</a>
        </template>
        <template v-else-if="column.key === 'projectId'">
          <a-tooltip v-if="record.projectId" :title="`${record.projectId} · ${bookName(record.projectId)}`">
            <span class="book-name">📖 {{ bookName(record.projectId) }}</span>
          </a-tooltip>
          <span v-else>-</span>
        </template>
        <template v-else-if="column.key === 'chapterNumber'">
          <span>{{ record.chapterNumber || '-' }}</span>
        </template>
      </template>
    </a-table>

    <!-- 窄屏（≤768px）：卡片式列表替代表格（375px 下横向滚动表格不可用） -->
    <div class="mobile-list">
      <a-skeleton v-if="loading && !traces.length" active :paragraph="{ rows: 6 }" />
      <template v-else>
        <div
          v-for="t in traces"
          :key="t.id"
          class="mobile-card"
          @click="onRowClick(t)"
        >
          <div class="mobile-card-title">{{ t.name }}</div>
          <div v-if="t.projectId || t.chapterNumber" class="mobile-card-tags">
            <span
              v-if="t.projectId"
              class="mobile-chip mobile-book"
              :title="`${t.projectId} · ${bookName(t.projectId)}`"
            >📖 {{ bookName(t.projectId) }}</span>
            <span v-if="t.chapterNumber" class="mobile-chip">第{{ t.chapterNumber }}章</span>
          </div>
          <div class="mobile-card-meta">
            <span>{{ formatTime(t.timestamp) }}</span>
            <span class="dot">·</span>
            <span>{{ t.latency ? t.latency.toFixed(1) + 's' : '-' }}</span>
            <span class="dot">·</span>
            <span>{{ t.observationCount }} 个观测</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 加载更多 / 分页底部 -->
    <div class="list-footer">
      <div v-if="!traces.length && !loading" class="empty-inline">
        <div class="empty-inline-icon">📭</div>
        <div class="empty-inline-text">暂无调用记录</div>
      </div>
      <a-button
        v-if="hasMore && traces.length"
        type="default"
        block
        :loading="loading"
        class="load-more-btn"
        @click="loadMore"
      >
        加载更多
      </a-button>
      <div v-if="!hasMore && traces.length" class="list-end">
        已加载全部 {{ traces.length }} 条记录
      </div>
    </div>
  </a-card>

  <TraceDrawer :trace-id="selectedTraceId" v-model:open="drawerOpen" />
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-select { width: 200px; }
.trace-name {
  color: var(--primary);
  cursor: pointer;
  font-weight: 500;
}
.trace-name:hover { text-decoration: underline; }
.book-name { cursor: pointer; }
:deep(.ant-table-tbody > tr) { cursor: pointer; }
:deep(.ant-table-tbody > tr:hover > td) { background: var(--primary-bg) !important; }

/* 列表底部 */
.list-footer {
  margin-top: 16px;
  text-align: center;
}
.load-more-btn {
  max-width: 240px;
  margin: 0 auto;
  border-radius: var(--radius-md);
}
.list-end {
  font-size: 13px;
  color: var(--text-tertiary);
  padding: 8px 0;
}

/* 内联空状态 */
.empty-inline {
  text-align: center;
  padding: 48px 0;
}
.empty-inline-icon { font-size: 48px; margin-bottom: 12px; }
.empty-inline-text { color: var(--text-tertiary); font-size: 14px; }

/* 窄屏卡片式列表：>768px 时隐藏，仅桌面表格生效 */
.mobile-list { display: none; }

/* 移动端 */
@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .filter-select { width: 100%; }
  .filter-bar :deep(.ant-picker) { width: 100%; }

  /* 768px 以下：隐藏横向滚动表格，切换为卡片列表 */
  .desktop-table { display: none; }
  .mobile-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mobile-card {
    background: var(--card-bg);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: border-color 0.2s ease;
  }
  .mobile-card:active { border-color: var(--primary-light); }
  .mobile-card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .mobile-chip {
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--bg);
    border: 1px solid var(--border-light);
    border-radius: 999px;
    padding: 2px 10px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-book { max-width: 100%; }
  .mobile-card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }
  .mobile-card-meta .dot { color: var(--text-tertiary); }
}
</style>
