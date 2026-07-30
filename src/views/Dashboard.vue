<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { SlimTrace } from '../types'
import StatCard from '../components/StatCard.vue'
import TrendChart from '../components/TrendChart.vue'
import NameChart from '../components/NameChart.vue'

const { fetchTraces } = useLangfuse()
const loading = ref(true)
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

async function load() {
  loading.value = true
  try {
    // 拉最近 7 天最多 500 条用于统计
    const from = new Date()
    from.setDate(from.getDate() - 7)
    const res = await fetchTraces({ limit: 100, fromTimestamp: from.toISOString() })
    traces.value = res.data
    // 翻页拉取剩余
    let page = 2
    while (page <= res.meta.totalPages && page <= 5) {
      const more = await fetchTraces({ limit: 100, page, fromTimestamp: from.toISOString() })
      traces.value.push(...more.data)
      page++
    }
  } catch (e: any) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <a-spin :spinning="loading">
    <div class="dashboard">
      <div class="stat-cards">
        <StatCard title="今日调用次数" :value="todayCount" suffix="次" icon="📡" />
        <StatCard title="最近7天总调用" :value="traces.length" suffix="次" icon="📈" />
        <StatCard title="平均耗时(今日)" :value="avgLatency" suffix="秒" icon="⏱️" />
        <StatCard title="任务类型数" :value="byName.length" suffix="种" icon="🏷️" />
      </div>

      <a-row :gutter="16" style="margin-top: 16px;">
        <a-col :xs="24" :lg="14">
          <a-card title="最近 7 天调用量趋势" class="chart-card">
            <TrendChart :data="trend" />
          </a-card>
        </a-col>
        <a-col :xs="24" :lg="10">
          <a-card title="任务类型分布" class="chart-card">
            <NameChart :data="byName" />
          </a-card>
        </a-col>
      </a-row>

      <a-card title="任务类型明细" style="margin-top: 16px;">
        <a-empty v-if="!byName.length" description="暂无数据" />
        <a-table v-else :data-source="byName.map(([name, count]) => ({ name, count }))" :pagination="false" size="small">
          <a-table-column title="任务名称" data-index="name" />
          <a-table-column title="调用次数" data-index="count" :width="120" />
        </a-table>
      </a-card>
    </div>
  </a-spin>
</template>

<style scoped>
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.chart-card { border-radius: 8px; }
</style>
