import type { TraceListResponse, TraceDetail, StatsResponse } from '../types'
import { getAccessKey, clearAccess } from './useAccess'

/**
 * 带超时与自动重试的请求封装。
 * - 访问密码：自动携带 X-Access-Key 请求头（值来自 localStorage）
 * - 401：密码失效，清掉本地密码回到密码页（useAccess 广播）
 * - 超时：默认 20 秒（CF Function 冷启动 + Langfuse API 往返），
 *   个别慢接口（如 30 天统计冷启动要串几十个上游查询）可单独放宽
 * - 重试：5xx 错误自动重试最多 2 次，递增等待（1s → 2s），
 *   专门应对 CF Pages Function 冷启动首次请求 502 的问题。
 */
async function api<T>(path: string, retries = 2, timeoutMs = 20000): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const resp = await fetch(path, {
        signal: controller.signal,
        headers: { 'X-Access-Key': getAccessKey() },
      })
      clearTimeout(timer)
      if (resp.status === 401) {
        // 密码不对/已失效：清本地密码，全局回到密码页（不重试）
        clearAccess()
        const err = new Error('密码不对，请重新输入')
        ;(err as any).noRetry = true
        throw err
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        const err = new Error(body.error || `HTTP ${resp.status}`)
        // 4xx 客户端错误不重试，只有 5xx 才重试
        if (resp.status < 500 || attempt === retries) throw err
        lastErr = err
        // 递增等待：第1次重试等1秒，第2次等2秒
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      return resp.json()
    } catch (e: any) {
      clearTimeout(timer)
      if (e?.noRetry || attempt === retries) throw e
      lastErr = e
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('请求失败')
}

export interface TraceQuery {
  limit?: number
  cursor?: string
  name?: string
  fromTimestamp?: string
  toTimestamp?: string
  userId?: string
  /** 缓存穿透参数：强制刷新时带时间戳改变 URL 绕开浏览器缓存，后端会忽略 */
  _?: string
}

export function useLangfuse() {
  /** 拉取 trace 列表（v2 cursor 分页） */
  async function fetchTraces(query: TraceQuery = {}): Promise<TraceListResponse> {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v) sp.set(k, String(v))
    }
    return api<TraceListResponse>(`/api/traces?${sp.toString()}`)
  }

  /** 拉取 trace 详情（含 observations） */
  async function fetchTraceDetail(id: string): Promise<TraceDetail> {
    return api<TraceDetail>(`/api/traces/${id}`)
  }

  /** 拉取看板统计（服务端聚合，tz 用于按本地时区切天）。
   *  30 天冷启动要在上游串几十个查询，超时放宽到 60 秒 */
  async function fetchStats(days: number): Promise<StatsResponse> {
    return api<StatsResponse>(
      `/api/stats?days=${days}&tz=${new Date().getTimezoneOffset()}`,
      2,
      60000
    )
  }

  return { fetchTraces, fetchTraceDetail, fetchStats }
}
