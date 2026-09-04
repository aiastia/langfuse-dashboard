<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { useLangfuse } from '../composables/useLangfuse'
import type { StatsResponse } from '../types'
import StatCard from '../components/StatCard.vue'
import TrendChart from '../components/TrendChart.vue'
import NameChart from '../components/NameChart.vue'

const { fetchStats } = useLangfuse()
// 统计时间范围（天）：所有卡片、Token、趋势图跟随此范围
const rangeDays = ref(7)
const stats = ref<StatsResponse | null>(null)
const firstLoading = ref(true) // 首次进入显示骨架屏
const rangeLoading = ref(false) // 切换范围时保留旧数据 + 转圈提示
const loadError = ref('')

async function load() {
  if (!stats.value) firstLoading.value = true
  else rangeLoading.value = true
  loadError.value = ''
  try {
    stats.value = await fetchStats(rangeDays.value)
  } catch (e: any) {
    loadError.value = e.message || '加载失败'
    message.error('统计数据加载失败，请重试')
    console.error(e)
  } finally {
    firstLoading.value = false
    rangeLoading.value = false
  }
}

// Token 6 项（服务端聚合）
const tokenStats = computed(() => stats.value?.tokens)
const cacheHitRate = computed(() => stats.value?.cacheHitRate ?? null)
// 图表只展示前 10 类，明细表格展示全部
const topNames = computed(() => (stats.value?.byName || []).slice(0, 10))

function fmt(n: number | undefined) {
  return (n || 0).toLocaleString()
}

onMounted(load)
</script>

<template>
  <!-- 首次加载骨架屏 -->
  <div v-if="firstLoading" class="skeleton-wrap">
    <div class="skeleton-cards">
      <a-skeleton-input v-for="i in 4" :key="i" active size="large" style="height: 88px; width: 100%;" />
    </div>
    <a-skeleton active :paragraph="{ rows: 6 }" style="margin-top: 24px;" />
  </div>

  <!-- 加载失败 + 重试 -->
  <div v-else-if="loadError && !stats" class="error-state">
    <div class="error-icon">⚠️</div>
    <div class="error-title">数据加载失败</div>
    <div class="error-desc">{{ loadError }}</div>
    <a-button type="primary" @click="load">🔄 重新加载</a-button>
  </div>

  <!-- 正常面板 -->
  <div v-else-if="stats" class="dashboard">
    <div class="stat-cards">
      <StatCard title="今日调用次数" :value="stats.todayCalls" suffix="次" icon="📡" />
      <StatCard :title="`最近${stats.days}天总调用`" :value="stats.totalCalls" suffix="次" icon="📈" />
      <StatCard :title="`平均耗时(近${stats.days}天)`" :value="stats.avgLatencySec" suffix="秒" icon="⏱️" />
      <StatCard title="任务类型数" :value="stats.byName.length" suffix="种" icon="🏷️" />
    </div>

    <!-- Token 用量六项明细 -->
    <a-card style="margin-top: 16px;">
      <template #title>🔤 Token 用量（近 {{ stats.days }} 天）</template>
      <template #extra>
        <a-radio-group
          :value="rangeDays"
          size="small"
          button-style="solid"
          class="range-switch"
          :disabled="rangeLoading"
          @update:value="(v: number) => { rangeDays = v; load() }"
        >
          <a-radio-button :value="7">7天</a-radio-button>
          <a-radio-button :value="30">30天</a-radio-button>
        </a-radio-group>
        <a-spin v-if="rangeLoading" size="small" style="margin-right: 10px;" />
        <a-tag v-if="cacheHitRate !== null && cacheHitRate > 0" color="green">
          ⚡ 缓存命中 {{ cacheHitRate }}%
        </a-tag>
        <a-tag color="blue">总计 {{ fmt(tokenStats?.total) }}</a-tag>
      </template>
      <div class="token-grid">
        <div class="token-cell">
          <span class="token-label">📥 输入</span>
          <span class="token-num">{{ fmt(tokenStats?.input) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">⚡ 输入缓存</span>
          <span class="token-num token-cache">{{ fmt(tokenStats?.cache) }}</span>
        </div>
        <div class="token-cell token-sum">
          <span class="token-label">Σ 总输入</span>
          <span class="token-num">{{ fmt(tokenStats?.totalInput) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">📤 输出</span>
          <span class="token-num">{{ fmt(tokenStats?.output) }}</span>
        </div>
        <div class="token-cell">
          <span class="token-label">🧠 思考</span>
          <span class="token-num token-think">{{ fmt(tokenStats?.reasoning) }}</span>
        </div>
        <div class="token-cell token-sum">
          <span class="token-label">Σ 总输出</span>
          <span class="token-num">{{ fmt(tokenStats?.totalOutput) }}</span>
        </div>
      </div>
    </a-card>

    <a-row :gutter="[16, { xs: 12, sm: 16, lg: 16 }]" style="margin-top: 16px;">
      <a-col :xs="24" :lg="14">
        <a-card :title="`最近 ${stats.days} 天调用量趋势`">
          <TrendChart :data="stats.trend" />
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="10">
        <a-card title="任务类型分布">
          <NameChart :data="topNames" />
        </a-card>
      </a-col>
    </a-row>

    <a-card style="margin-top: 16px;">
      <template #title>任务类型明细</template>
      <div v-if="!stats.byName.length" class="empty-inline">
        <div class="empty-inline-icon">📭</div>
        <div class="empty-inline-text">暂无调用数据</div>
      </div>
      <a-table
        v-else
        :data-source="stats.byName.map(([name, count]) => ({ name, count }))"
        :pagination="{ pageSize: 10, size: 'small' }"
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

/* 范围切换按钮（卡片 extra 内，与右侧 tag 留间距） */
.range-switch {
  margin-right: 10px;
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
  overflow-wrap: anywhere; /* 长数字窄屏下允许断行，避免溢出单元格 */
}
.token-cache { color: var(--success); }
.token-think { color: #9254DE; }

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

/* 手机（375px 级）：数字格改 2 列，字号进一步收缩保证完整显示 */
@media (max-width: 480px) {
  .token-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .token-cell { padding: 8px 10px; }
  .token-num { font-size: 15px; }
  .token-label { font-size: 11px; }
}
</style>
