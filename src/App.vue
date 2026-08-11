<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeKey = computed(() => route.path)

const menuItems = [
  { key: '/', label: '📊 统计面板' },
  { key: '/traces', label: '📋 调用记录' },
]

// 响应式断点：md = 768px，窄屏用抽屉菜单替代固定侧边栏
const isMobile = ref(false)
const drawerOpen = ref(false)

function checkBreakpoint() {
  isMobile.value = window.innerWidth <= 768
}
function onNavigate(key: string) {
  router.push(key)
  drawerOpen.value = false // 选择后关闭抽屉
}
// 类型安全的菜单点击处理（宽屏）
function onMenuClick({ key }: { key: string }) {
  router.push(key)
}
// 类型安全的菜单点击处理（窄屏抽屉，选择后关闭）
function onMenuClickMobile({ key }: { key: string }) {
  onNavigate(key)
}

onMounted(() => {
  checkBreakpoint()
  window.addEventListener('resize', checkBreakpoint)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkBreakpoint)
})
</script>

<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="app-header">
      <!-- 窄屏汉堡按钮 -->
      <span v-if="isMobile" class="hamburger" @click="drawerOpen = true">☰</span>
      <div class="logo">🔍 AI 可观测性看板</div>
    </a-layout-header>
    <a-layout>
      <!-- 宽屏：固定侧边栏（窄屏隐藏） -->
      <a-layout-sider v-if="!isMobile" width="200" class="app-sider">
        <a-menu mode="inline" :selected-keys="[activeKey]" @click="onMenuClick">
          <a-menu-item v-for="item in menuItems" :key="item.key">{{ item.label }}</a-menu-item>
        </a-menu>
      </a-layout-sider>
      <a-layout-content class="app-content">
        <router-view />
      </a-layout-content>
    </a-layout>

    <!-- 窄屏：抽屉式导航菜单 -->
    <a-drawer
      v-if="isMobile"
      :open="drawerOpen"
      placement="left"
      title="导航"
      :width="240"
      @update:open="drawerOpen = $event"
    >
      <a-menu mode="inline" :selected-keys="[activeKey]" @click="onMenuClickMobile">
        <a-menu-item v-for="item in menuItems" :key="item.key">{{ item.label }}</a-menu-item>
      </a-menu>
    </a-drawer>
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
.hamburger {
  color: #fff;
  font-size: 20px;
  margin-right: 12px;
  cursor: pointer;
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

/* 移动端：缩小 content padding */
@media (max-width: 768px) {
  .app-header { padding: 0 12px; }
  .logo { font-size: 16px; }
  .app-content { padding: 12px; }
}
</style>
