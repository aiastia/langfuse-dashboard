<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import { useLangfuse } from '../composables/useLangfuse'
import type { SlimTrace, TokenBreakdown } from '../types'
import TraceDrawer from '../components/TraceDrawer.vue'

const { fetchTraces } = useLangfuse()
const PAGE_LIMIT = 50
const loading = ref(false)
const loadingMore = ref(false)
const traces = ref<SlimTrace[]>([])
const hasMore = ref(false)
const cursor = ref<string | null>(null) // 本日内"加载更多"的翻页游标

// 按天分页：一天一页，selectedDate 就是当前页
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))
const isToday = computed(() => selectedDate.value === dayjs().format('YYYY-MM-DD'))
const dateLabel = computed(() => dayjs(selectedDate.value).format('M月D日'))

const filters = reactive({
  name: '' as string,
})

// 任务类型选项（跨浏览过的天累积）
const nameOptions = ref<string[]>([])

const selectedTraceId = ref('')
const drawerOpen = ref(false)

/** 前端内存日缓存：翻来翻去看过的天秒开，不用每次都等接口 */
interface DayPage {
  traces: SlimTrace[]
  hasMore: boolean
  cursor: string | null
}
const dayCache = new Map<string, DayPage>()
function cacheKeyFor(dateStr: string) {
  return `${dateStr}|${filters.name || ''}`
}

function applyEntry(e: DayPage) {
  traces.value = e.traces
  hasMore.value = e.hasMore
  cursor.value = e.cursor
  collectNames()
}

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

/** 当前天 + 名称筛选对应的查询参数（本地时区的一天） */
function rangeParams() {
  const d = dayjs(selectedDate.value)
  const p: Record<string, string> = {
    fromTimestamp: d.startOf('day').toISOString(),
    toTimestamp: d.endOf('day').toISOString(),
  }
  if (filters.name) p.name = filters.name
  return p
}

function collectNames() {
  const s = new Set(nameOptions.value)
  traces.value.forEach((t) => s.add(t.name))
  nameOptions.value = [...s]
}

/** 加载某一天（切换日期页）。force=true 跳过前端缓存重新拉 */
async function loadDay(dateStr: string, force = false) {
  selectedDate.value = dateStr
  const key = cacheKeyFor(dateStr)
  const hit = dayCache.get(key)
  if (hit && !force) {
    applyEntry(hit)
    return
  }
  loading.value = true
  traces.value = []
  hasMore.value = false
  cursor.value = null
  try {
    const res = await fetchTraces({
      limit: PAGE_LIMIT,
      ...rangeParams(),
      ...(force ? { _: String(Date.now()) } : {}),
    })
    const entry: DayPage = {
      traces: res.data,
      hasMore: res.meta.hasMore,
      cursor: res.meta.nextCursor,
    }
    dayCache.set(key, entry)
    applyEntry(entry)
  } catch (e: any) {
    message.error('数据加载失败，请重试')
    console.error(e)
  } finally {
    loading.value = false
  }
}

/** 刷新按钮：绕开浏览器缓存 + 前端日缓存，重新拉当天 */
function refresh() {
  loadDay(selectedDate.value, true)
}

/** 同一 trace 的两段用量相加（跨页截断合并用） */
function mergeUsage(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  const out: any = { ...a }
  for (const k of Object.keys(a) as (keyof TokenBreakdown)[]) out[k] = a[k] + b[k]
  return out
}

/** 本日加载更多：上游游标按 observation 行推进，
 *  一个 trace 的后半截会出现在下一批 —— 按 id 合并回已有条目 */
async function loadMore() {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await fetchTraces({ limit: PAGE_LIMIT, cursor: cursor.value, ...rangeParams() })
    const byId = new Map(traces.value.map((t) => [t.id, t]))
    const appended: SlimTrace[] = []
    for (const t of res.data) {
      const prev = byId.get(t.id)
      if (prev) {
        prev.usage = mergeUsage(prev.usage, t.usage)
        prev.observationCount += t.observationCount
        prev.totalCost += t.totalCost
      } else {
        byId.set(t.id, t)
        appended.push(t)
      }
    }
    traces.value.push(...appended)
    traces.value.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    hasMore.value = res.meta.hasMore
    cursor.value = res.meta.nextCursor
    // 日缓存里的 traces 数组和页面是同一个引用，这里同步翻页状态即可
    const entry = dayCache.get(cacheKeyFor(selectedDate.value))
    if (entry) {
      entry.hasMore = hasMore.value
      entry.cursor = cursor.value
    }
    collectNames()
  } catch (e: any) {
    message.error('数据加载失败，请重试')
    console.error(e)
  } finally {
    loadingMore.value = false
  }
}

function shiftDay(n: number) {
  loadDay(dayjs(selectedDate.value).add(n, 'day').format('YYYY-MM-DD'))
}

function goToday() {
  loadDay(dayjs().format('YYYY-MM-DD'))
}

function onDateChange(ds: any) {
  if (ds) loadDay(String(ds))
}

/** 禁选未来日期 */
function disabledDate(d: any) {
  return d && d.isAfter(dayjs(), 'day')
}

/** 首次进入：今天没记录就往前找，最多回看 7 天，定位到最近有调用的一天 */
async function init() {
  loading.value = true
  let d = dayjs()
  try {
    for (let i = 0; i < 8; i++) {
      const res = await fetchTraces({
        limit: PAGE_LIMIT,
        fromTimestamp: d.startOf('day').toISOString(),
        toTimestamp: d.endOf('day').toISOString(),
        ...(filters.name ? { name: filters.name } : {}),
      })
      if (res.data.length || res.meta.hasMore) {
        selectedDate.value = d.format('YYYY-MM-DD')
        const entry: DayPage = {
          traces: res.data,
          hasMore: res.meta.hasMore,
          cursor: res.meta.nextCursor,
        }
        dayCache.set(cacheKeyFor(selectedDate.value), entry)
        applyEntry(entry)
        if (i > 0) message.info(`今天暂无调用，已定位到最近有记录的 ${d.format('M月D日')}`)
        break
      }
      d = d.subtract(1, 'day')
    }
  } catch (e: any) {
    message.error('数据加载失败，请重试')
    console.error(e)
  } finally {
    loading.value = false
  }
}

function onRowClick(record: SlimTrace) {
  selectedTraceId.value = record.id
  drawerOpen.value = true
}

onMounted(init)
</script>

<template>
  <a-card>
    <!-- 筛选栏：按天翻页 + 任务类型 -->
    <div class="filter-bar">
      <div class="day-nav">
        <a-button :disabled="loading" @click="shiftDay(-1)">‹ 前一天</a-button>
        <a-date-picker
          :value="selectedDate"
          value-format="YYYY-MM-DD"
          :allow-clear="false"
          :disabled-date="disabledDate"
          @change="onDateChange"
        />
        <a-button :disabled="isToday || loading" @click="shiftDay(1)">后一天 ›</a-button>
        <a-button :disabled="isToday || loading" @click="goToday">今天</a-button>
      </div>
      <a-select
        v-model:value="filters.name"
        placeholder="任务类型"
        allow-clear
        class="filter-select"
        @change="loadDay(selectedDate)"
      >
        <a-select-option v-for="n in nameOptions" :key="n" :value="n">{{ n }}</a-select-option>
      </a-select>
      <a-button @click="refresh">🔄 刷新</a-button>
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

    <!-- 底部：空状态 + 本日加载更多 -->
    <div class="list-footer">
      <div v-if="!traces.length && !loading" class="empty-inline">
        <div class="empty-inline-icon">📭</div>
        <div class="empty-inline-text">{{ dateLabel }} 暂无调用记录</div>
      </div>
      <a-button
        v-if="hasMore && (traces.length || !loading)"
        type="default"
        block
        :loading="loadingMore"
        class="load-more-btn"
        @click="loadMore"
      >
        加载本日更多
      </a-button>
      <div v-else-if="traces.length" class="list-end">
        {{ dateLabel }} 已加载全部 {{ traces.length }} 条
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
.day-nav {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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
  .day-nav :deep(.ant-picker) { flex: 1; }
  .filter-select { width: 100%; }

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
