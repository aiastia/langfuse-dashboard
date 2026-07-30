<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeKey = computed(() => route.path)

const menuItems = [
  { key: '/', label: '📊 统计面板' },
  { key: '/traces', label: '📋 调用记录' },
]
</script>

<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="app-header">
      <div class="logo">🔍 AI 可观测性看板</div>
    </a-layout-header>
    <a-layout>
      <a-layout-sider width="200" class="app-sider" breakpoint="md" :collapsed-width="0">
        <a-menu mode="inline" :selected-keys="[activeKey]" @click="({ key }) => router.push(key)">
          <a-menu-item v-for="item in menuItems" :key="item.key">{{ item.label }}</a-menu-item>
        </a-menu>
      </a-layout-sider>
      <a-layout-content class="app-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style>
:root {
  --primary: #4D8088;
  --bg: #FAFAF8;
  --card-bg: #fff;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); font-family: -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif; }

.app-header {
  background: var(--primary);
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 56px;
  line-height: 56px;
}
.logo {
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.app-sider {
  background: #fff;
  border-right: 1px solid #f0ede6;
}
.app-sider .ant-menu { border-inline-end: none; padding-top: 12px; }
.app-content {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
</style>
