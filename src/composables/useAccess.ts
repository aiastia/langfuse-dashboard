import { ref } from 'vue'

/**
 * 访问密码（Access Key）全局状态。
 *
 * - 密码存 localStorage（key: langfuse_access_key），刷新不丢
 * - authorized 是模块级单例 ref，所有组件共享同一状态
 * - 任何 API 请求收到 401 时调用 clearAccess()，
 *   广播 'access:unauthorized' 事件 → authorized 变 false → 密码页重新出现
 */
const STORAGE_KEY = 'langfuse_access_key'

function readStoredKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

// 模块级单例：首次 import 时读一次 localStorage
const accessKey = ref(readStoredKey())
const authorized = ref(!!accessKey.value)

// 401 广播监听（模块只加载一次，不会重复注册）
if (typeof window !== 'undefined') {
  window.addEventListener('access:unauthorized', () => {
    accessKey.value = ''
    authorized.value = false
  })
}

export function getAccessKey(): string {
  return accessKey.value || readStoredKey()
}

/** 验证通过后调用：存 localStorage 并放行进入看板 */
export function signInAccess(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // localStorage 不可用（隐私模式等）时仅内存态生效，本次会话内可用
  }
  accessKey.value = key
  authorized.value = true
}

/** 清掉本地密码并回到密码页（401 / 手动退出时调用） */
export function clearAccess() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  accessKey.value = ''
  authorized.value = false
  window.dispatchEvent(new CustomEvent('access:unauthorized'))
}

export function useAccess() {
  return { authorized, accessKey, signInAccess, clearAccess }
}
