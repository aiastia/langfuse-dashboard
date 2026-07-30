<script setup lang="ts">
defineProps<{
  title: string
  value: number | string
  suffix?: string
  icon?: string
}>()
</script>

<template>
  <a-card class="stat-card" hoverable>
    <div class="stat-inner">
      <div class="stat-icon" v-if="icon">{{ icon }}</div>
      <div class="stat-body">
        <div class="stat-value">{{ value }}<span class="stat-suffix" v-if="suffix">{{ suffix }}</span></div>
        <div class="stat-title">{{ title }}</div>
      </div>
    </div>
  </a-card>
</template>

<style scoped>
.stat-card { border-radius: 8px; }
.stat-inner { display: flex; align-items: center; gap: 14px; }
.stat-icon { font-size: 28px; }
.stat-value { font-size: 28px; font-weight: 700; color: #333; line-height: 1.2; }
.stat-suffix { font-size: 14px; color: #8c8c8c; margin-left: 4px; font-weight: 400; }
.stat-title { font-size: 13px; color: #8c8c8c; margin-top: 4px; }
</style>
