import type { TraceListResponse, TraceDetail } from '../types'

/**
 * 带超时与自动重试的请求封装。
 * - 超时：12 秒，用 AbortController 控制（CF Function 冷启动偶发偏慢）
 * - 重试：首次请求失败时自动重试 1 次（冷启动首次偶发超时/502，重试通常命中已启动的 isolate）
 */
async function api<T>(path: string, retries = 1): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try {
      const resp = await fetch(path, { signal: controller.signal })
      clearTimeout(timer)
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        const err = new Error(body.error || `HTTP ${resp.status}`)
        // 4xx 客户端错误不重试，只有 5xx/网络错误才重试
        if (resp.status < 500 || attempt === retries) throw err
        lastErr = err
        continue
      }
      return resp.json()
    } catch (e: any) {
      clearTimeout(timer)
      if (attempt === retries) throw e
      lastErr = e
      // 短暂等待后重试（冷启动通常几百毫秒内恢复）
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('请求失败')
}

export interface TraceQuery {
  limit?: number
  page?: number
  name?: string
  fromTimestamp?: string
  toTimestamp?: string
  userId?: string
}

export function useLangfuse() {
  /** 拉取 trace 列表 */
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

  return { fetchTraces, fetchTraceDetail }
}
