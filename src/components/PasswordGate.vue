<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { signInAccess } from '../composables/useAccess'

const password = ref('')
const loading = ref(false)
const errorText = ref('')
const inputRef = ref<{ focus: () => void } | null>(null)

onMounted(async () => {
  // 自动聚焦，手机上直接弹键盘
  await nextTick()
  inputRef.value?.focus()
})

async function submit() {
  const key = password.value.trim()
  if (!key || loading.value) return
  loading.value = true
  errorText.value = ''
  try {
    const resp = await fetch('/api/verify', {
      headers: { 'X-Access-Key': key },
    })
    if (resp.status === 401) {
      errorText.value = '密码不对'
      inputRef.value?.focus()
      return
    }
    if (!resp.ok) {
      errorText.value = '服务暂不可用，请稍后重试'
      return
    }
    signInAccess(key)
  } catch {
    errorText.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="gate-wrap">
    <div class="gate-card">
      <div class="gate-icon">🔐</div>
      <div class="gate-title">AI 可观测性看板</div>
      <div class="gate-subtitle">请输入访问密码</div>
      <a-input-password
        ref="inputRef"
        v-model:value="password"
        placeholder="访问密码"
        size="large"
        autocomplete="current-password"
        @pressEnter="submit"
      />
      <div v-if="errorText" class="gate-error">{{ errorText }}</div>
      <a-button
        type="primary"
        size="large"
        block
        :loading="loading"
        :disabled="!password.trim()"
        @click="submit"
      >
        进入看板
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.gate-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 50%, var(--primary-light) 100%);
}
.gate-card {
  width: 100%;
  max-width: 360px;
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 36px 28px 28px;
  text-align: center;
}
.gate-icon { font-size: 40px; margin-bottom: 12px; }
.gate-title {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}
.gate-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 6px 0 20px;
}
.gate-error {
  color: var(--error);
  font-size: 13px;
  text-align: left;
  margin: 8px 2px;
}
.gate-card :deep(.ant-btn-lg) {
  margin-top: 4px;
  border-radius: var(--radius-md);
  font-weight: 600;
}
.gate-card :deep(.ant-input-password) {
  border-radius: var(--radius-md);
}

/* 手机：卡片占满宽度，留出键盘空间 */
@media (max-width: 768px) {
  .gate-wrap { padding: 16px; align-items: flex-start; padding-top: 12vh; }
  .gate-card { padding: 28px 20px 20px; }
  .gate-title { font-size: 17px; }
}
</style>
