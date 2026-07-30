<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { SlimTrace } from '../types'
import TraceDrawer from '../components/TraceDrawer.vue'

const { fetchTraces } = useLangfuse()
const loading = ref(false)
const traces = ref<SlimTrace[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 50,
  total: 0,
})
const filters = reactive({
  name: '' as string,
  dateRange: [] as string[],
})

// 任务类型选项（从已加载数据动态提取）
const nameOptions = ref<string[]>([])

const selectedTraceId = ref('')
const drawerOpen = ref(false)

const columns = [
  { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 160, customRender: ({ text }: any) => formatTime(text) },
  { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '用户', dataIndex: 'userId', key: 'userId', width: 80 },
  { title: '项目', dataIndex: 'projectId', key: 'projectId', width: 80 },
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

async function load(page = 1) {
  loading.value = true
  try {
    const query: any = { limit: pagination.pageSize, page }
    if (filters.name) query.name = filters.name
    if (filters.dateRange?.length === 2) {
      query.fromTimestamp = new Date(filters.dateRange[0]).toISOString()
      query.toTimestamp = new Date(filters.dateRange[1] + 'T23:59:59').toISOString()
    }
    const res = await fetchTraces(query)
    traces.value = res.data
    pagination.current = res.meta.page
    pagination.total = res.meta.totalItems
    // 提取任务类型选项
    const names = new Set(res.data.map((t) => t.name))
    nameOptions.value = [...names]
  } catch (e: any) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function onTableChange(pag: any) {
  pagination.current = pag.current
  load(pag.current)
}

function onRowClick(record: SlimTrace) {
  selectedTraceId.value = record.id
  drawerOpen.value = true
}

onMounted(() => load(1))
</script>

<template>
  <a-card>
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-select
        v-model:value="filters.name"
        placeholder="任务类型"
        allow-clear
        style="width: 200px"
        @change="load(1)"
      >
        <a-select-option v-for="n in nameOptions" :key="n" :value="n">{{ n }}</a-select-option>
      </a-select>
      <a-range-picker v-model:value="filters.dateRange" @change="load(1)" />
      <a-button @click="load(pagination.current)">🔄 刷新</a-button>
    </div>

    <a-table
      :columns="columns"
      :data-source="traces"
      :loading="loading"
      :pagination="pagination"
      :row-key="(r: SlimTrace) => r.id"
      size="small"
      :custom-row="(record: SlimTrace) => ({ onClick: () => onRowClick(record) })"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <a class="trace-name">{{ record.name }}</a>
        </template>
      </template>
    </a-table>
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
.trace-name {
  color: var(--primary);
  cursor: pointer;
  font-weight: 500;
}
.trace-name:hover { text-decoration: underline; }
:deep(.ant-table-tbody > tr) { cursor: pointer; }
:deep(.ant-table-tbody > tr:hover > td) { background: #f0f7f8 !important; }
</style>
