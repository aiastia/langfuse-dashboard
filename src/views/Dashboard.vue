<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { SlimTrace, TokenBreakdown } from '../types'
import StatCard from '../components/StatCard.vue'
import TrendChart from '../components/TrendChart.vue'
import NameChart from '../components/NameChart.vue'

const { fetchTraces } = useLangfuse()
const loading = ref(true)
const fetchingMore = ref(false)
const loadError = ref('')
const traces = ref<SlimTrace[]>([])

// 今日范围
const todayStart = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
})

// 统计卡片
const todayTraces = computed(() =>
  traces.value.filter((t) => t.timestamp >= todayStart.value)
)
const todayCount = computed(() => todayTraces.value.length)
const avgLatency = computed(() => {
  if (!todayTraces.value.length) return 0
  const sum = todayTraces.value.reduce((a, t) => a + (t.latency || 0), 0)
  return Math.round(sum / todayTraces.value.length * 10) / 10
})

// Token 6 项汇总（近 7 天已加载的全部 trace）
const tokenStats = computed<TokenBreakdown>(() =>
  traces.value.reduce(
    (acc, t) => {
      const u = t.usage
      if (u) {
        acc.input += u.input || 0
        acc.cache += u.cache || 0
        acc.totalInput += u.totalInput || 0
        acc.output += u.output || 0
        acc.reasoning += u.reasoning || 0
        acc.totalOutput += u.totalOutput || 0
        acc.total += u.total || 0
      }
      return acc
    },
    { input: 0, cache: 0, totalInput: 0, output: 0, reasoning: 0, totalOutput: 0, total: 0 }
  )
)
const cacheHitRate = computed(() => {
  const t = tokenStats.value
  if (!t.totalInput) return null
  return Math.round((t.cache / t.totalInput) * 1000) / 10
})
function fmt(n: number | undefined) {
  return (n || 0).toLocaleString()
}

// 按任务类型分组
const byName = computed(() => {
  const m: Record<string, number> = {}
  for (const t of traces.value) m[t.name] = (m[t.name] || 0) + 1
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10)
})

// 最近 7 天趋势
const trend = computed(() => {
  const days: { date: string; label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const count = traces.value.filter(
      (t) => t.timestamp >= d.toISOString() && t.timestamp < next.toISOString()
    ).length
    days.push({
      date: d.toISOString(),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count,
    })
  }
  return days
})

/**
 * 渐进加载：先拉首批并立即渲染，再后台静默翻页（cursor 分页）。
 */
async function load() {
  loading.value = true
  loadError.value = ''
  const from = new Date()
  from.setDate(from.getDate() - 7)
  try {
    // 首批 limit=50 快速展示
    const res = await fetchTraces({ limit: 50, fromTimestamp: from.toISOString() })
    traces.value = res.data
    loading.value = false

    // 后台静默补全剩余页（cursor 翻页，最多 5 次）
    if (res.meta.hasMore) {
      fetchingMore.value = true
      try {
        let cursor = res.meta.nextCursor
        let pages = 0
        while (cursor && pages < 5) {
          const more = await fetchTraces({
            limit: 50,
            cursor,
            fromTimestamp: from.toISOString(),
          })
          traces.value.push(...more.data)
          cursor = more.meta.nextCursor
          pages++
          if (!more.meta.hasMore) break
        }
      } catch (e) {
        console.error('后台翻页失败:', e)
      } finally {
        fetchingMore.value = false
      }
    }
  } catch (e: any) {
    loading.value = false
    loadError.value = e.message || '加载失败'
    message.error('数据加载失败，请重试')
    console.error(e)
  }
}

onMounted(load)
</script>

<template>
  <!-- 首次加载骨架屏 -->
  <div v-if="loading" class="skeleton-wrap">
    <div class="skeleton-cards">
      <a-skeleton-input v-for="i in 4" :key="i" active size="large" style="height: 88px; width: 100%;" />
    </div>
    <a-skeleton active :paragraph="{ rows: 6 }" style="margin-top: 24px;" />
  </div>

  <!-- 加载失败 + 重试 -->
  <div v-else-if="loadError && !traces.length" class="error-state">
    <div class="error-icon">⚠️</div>
    <div class="error-title">数据加载失败</div>
    <div class="error-desc">{{ loadError }}</div>
    <a-button type="primary" @click="load">🔄 重新加载</a-button>
  </div>

  <!-- 正常面板 -->
  <div v-else class="dashboard">
    <div class="stat-cards">
      <StatCard title="今日调用次数" :value="todayCount" suffix="次" icon="📡" />
      <StatCard title="最近7天总调用" :value="traces.length" suffix="次" icon="📈" />
      <StatCard title="平均耗时(今日)" :value="avgLatency" suffix="秒" icon="⏱️" />
      <StatCard title="任务类型数" :value="byName.length" suffix="种" icon="🏷️" />
    </div>

    <!-- Token 用量六项明细 -->
    <a-card style="margin-top: 16px;">
      <template #title>🔤 Token 用量（近 7 天）</template>
      <template #extra>
        <a-tag v-if="cacheHitRate !== null && cacheHitRate > 0" color="green">
          ⚡ 缓存命中 {{ cacheHitRate }}%
        </a-tag>
        <a-tag color="blue">总计 {{ fmt(tokenStats.total) }}</a-tag>
      </template>
      <div class="token-grid">
        <div class="token-cell">
          <span class="token-label">📥 输入</span>
          <span class="token-num">{{ fmt(tokenStats.input) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">⚡ 输入缓存</span>
          <span class="token-num token-cache">{{ fmt(tokenStats.cache) }}</span>
        </div>
        <div class="token-cell token-sum">
          <span class="token-label">Σ 总输入</span>
          <span class="token-num">{{ fmt(tokenStats.totalInput) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">📤 输出</span>
          <span class="token-num">{{ fmt(tokenStats.output) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">🧠 思考</span>
          <span class="token-num token-think">{{ fmt(tokenStats.reasoning) }}</span>
        </div>
        <div class="token-cell token-sum">
          <span class="token-label">Σ 总输出</span>
          <span class="token-num">{{ fmt(tokenStats.totalOutput) }}</span>
        </div>
      </div>
      <div v-if="fetchingMore" class="token-note">
        <a-spin size="small" /> 后台仍在加载更多数据，以上为已加载部分的统计…
      </div>
    </a-card>

    <a-row :gutter="[16, { xs: 12, sm: 16, lg: 16 }]" style="margin-top: 16px;">
      <a-col :xs="24" :lg="14">
        <a-card title="最近 7 天调用量趋势">
          <TrendChart :data="trend" />
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="10">
        <a-card title="任务类型分布">
          <NameChart :data="byName" />
        </a-card>
      </a-col>
    </a-row>

    <a-card style="margin-top: 16px;">
      <template #title>任务类型明细</template>
      <template #extra>
        <span v-if="fetchingMore" class="loading-more">
          <a-spin size="small" /> 加载更多...
        </span>
      </template>
      <div v-if="!byName.length" class="empty-inline">
        <div class="empty-inline-icon">📭</div>
        <div class="empty-inline-text">暂无调用数据</div>
      </div>
      <a-table
        v-else
        :data-source="byName.map(([name, count]) => ({ name, count }))"
        :pagination="false"
        size="small"
      >
        <a-table-column title="任务名称" data-index="name" />
        <a-table-column title="调用次数" data-index="count" :width="120" />
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
/* 骨架屏 */
.skeleton-wrap { padding: 4px 0; }
.skeleton-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

/* 错误状态 */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
}
.error-icon { font-size: 56px; margin-bottom: 16px; }
.error-title { font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.error-desc { font-size: 14px; color: var(--text-tertiary); margin-bottom: 24px; }

/* 统计卡片 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

/* Token 六项明细网格 */
.token-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}
.token-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  border: 1px solid var(--border-light);
}
.token-cell.token-sum {
  background: var(--primary-bg);
  border-color: transparent;
}
.token-label {
  font-size: 12px;
  color: var(--text-tertiary);
}
.token-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.token-cache { color: var(--success); }
.token-think { color: #9254DE; }
.token-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 加载更多提示 */
.loading-more {
  font-size: 12px;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 内联空状态 */
.empty-inline {
  text-align: center;
  padding: 40px 0;
}
.empty-inline-icon { font-size: 40px; margin-bottom: 8px; }
.empty-inline-text { color: var(--text-tertiary); font-size: 14px; }

/* 移动端 */
@media (max-width: 768px) {
  .stat-cards, .skeleton-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .token-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .token-cell { padding: 10px 12px; }
  .token-num { font-size: 17px; }
}
</style>
