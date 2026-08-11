<script setup lang="ts">
defineProps<{
  title: string
  value: number | string
  suffix?: string
  icon?: string
}>()
</script>

<template>
  <div class="stat-card">
    <div class="stat-icon" v-if="icon">{{ icon }}</div>
    <div class="stat-body">
      <div class="stat-value">
        {{ value }}<span class="stat-suffix" v-if="suffix">{{ suffix }}</span>
      </div>
      <div class="stat-title">{{ title }}</div>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--card-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
  cursor: default;
}
.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--primary-light);
}
.stat-icon {
  font-size: 32px;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-bg);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: -0.5px;
}
.stat-suffix {
  font-size: 14px;
  color: var(--text-tertiary);
  margin-left: 4px;
  font-weight: 400;
}
.stat-title {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 6px;
  font-weight: 500;
}

/* 移动端 */
@media (max-width: 768px) {
  .stat-card { padding: 14px; gap: 12px; }
  .stat-icon { width: 40px; height: 40px; font-size: 24px; }
  .stat-value { font-size: 24px; }
}
</style>
