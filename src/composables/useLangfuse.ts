import type { TraceListResponse, TraceDetail } from '../types'

async function api<T>(path: string): Promise<T> {
  const resp = await fetch(path)
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${resp.status}`)
  }
  return resp.json()
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
