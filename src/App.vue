<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeKey = computed(() => route.path)

const menuItems = [
  { key: '/', label: '统计面板', icon: '📊' },
  { key: '/traces', label: '调用记录', icon: '📋' },
]

// 响应式断点：md = 768px，窄屏用抽屉菜单替代固定侧边栏
const isMobile = ref(false)
const drawerOpen = ref(false)

function checkBreakpoint() {
  isMobile.value = window.innerWidth <= 768
}
function onNavigate(key: string) {
  router.push(key)
  drawerOpen.value = false
}
function onMenuClick({ key }: { key: string }) {
  router.push(key)
}
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
      <span v-if="isMobile" class="hamburger" @click="drawerOpen = true">
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
      </span>
      <div class="logo">
        <span class="logo-icon">🔍</span>
        <span class="logo-text">AI 可观测性看板</span>
      </div>
    </a-layout-header>
    <a-layout>
      <!-- 宽屏：固定侧边栏（窄屏隐藏） -->
      <a-layout-sider v-if="!isMobile" width="220" class="app-sider">
        <a-menu mode="inline" :selected-keys="[activeKey]" class="app-menu" @click="onMenuClick">
          <a-menu-item v-for="item in menuItems" :key="item.key">
            <span class="menu-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </a-menu-item>
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
      title="导航菜单"
      :width="260"
      @update:open="drawerOpen = $event"
    >
      <a-menu mode="inline" :selected-keys="[activeKey]" @click="onMenuClickMobile">
        <a-menu-item v-for="item in menuItems" :key="item.key">
          <span class="menu-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </a-menu-item>
      </a-menu>
    </a-drawer>
  </a-layout>
</template>

<style>
:root {
  /* 主色调 */
  --primary: #4D8088;
  --primary-light: #6BAEB8;
  --primary-dark: #3A6269;
  --primary-bg: #E8F1F3;

  /* 背景色 */
  --bg: #F5F6F8;
  --card-bg: #ffffff;
  --card-bg-hover: #FAFBFC;

  /* 文字色 */
  --text-primary: #1A1D21;
  --text-secondary: #535965;
  --text-tertiary: #8A9099;

  /* 边框与分割线 */
  --border: #E8EAED;
  --border-light: #F0F1F4;

  /* 语义色 */
  --success: #52C41A;
  --warning: #FAAD14;
  --error: #FF4D4F;
  --info: #1890FF;

  /* 阴影 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.1);

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', 'Segoe UI', sans-serif;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 美化滚动条 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #B0B5BC; }

/* Header */
.app-header {
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 50%, var(--primary-light) 100%);
  display: flex;
  align-items: center;
  padding: 0 24px;
  height: 60px;
  line-height: 60px;
  box-shadow: var(--shadow-md);
  position: relative;
  z-index: 10;
}
.hamburger {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 60px;
  margin-right: 12px;
  cursor: pointer;
}
.hamburger-line {
  display: block;
  width: 20px;
  height: 2px;
  background: #fff;
  border-radius: 1px;
  transition: all 0.2s;
}
.logo {
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
}
.logo-icon { font-size: 22px; }
.logo-text { font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }

/* 侧边栏 */
.app-sider {
  background: var(--card-bg);
  border-right: 1px solid var(--border-light);
}
.app-sider .app-menu {
  border-inline-end: none !important;
  padding-top: 16px;
}
.menu-icon { margin-right: 8px; font-size: 16px; }

/* 内容区 */
.app-content {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 全局卡片样式覆盖 */
.app-content .ant-card {
  border-radius: var(--radius-md) !important;
  border: 1px solid var(--border-light) !important;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease;
}
.app-content .ant-card:hover {
  box-shadow: var(--shadow-md);
}
.app-content .ant-card-head {
  border-bottom: 1px solid var(--border-light) !important;
  min-height: 48px !important;
  padding: 0 20px !important;
}
.app-content .ant-card-head-title {
  font-size: 15px !important;
  font-weight: 600 !important;
  color: var(--text-primary) !important;
}
.app-content .ant-card-body {
  padding: 20px !important;
}

/* 移动端 */
@media (max-width: 768px) {
  .app-header { padding: 0 12px; height: 54px; line-height: 54px; }
  .logo-text { font-size: 16px; }
  .app-content { padding: 12px; }
  .app-content .ant-card-body { padding: 14px !important; }
  .app-content .ant-card-head { padding: 0 14px !important; }
}
</style>
