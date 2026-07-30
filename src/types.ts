/** Trace 列表项（精简后） */
export interface SlimTrace {
  id: string
  name: string
  timestamp: string
  userId: string
  sessionId: string
  latency: number // 秒
  totalCost: number
  observationCount: number
  runner: string
  projectId: string
  chapterNumber: string
  taskTitle: string
  tags: string[]
  environment: string
}

/** Observation 详情（精简后） */
export interface SlimObservation {
  id: string
  type: string // TRACE / SPAN / GENERATION
  name: string
  model: string
  startTime: string
  endTime: string
  latency: number // 秒
  cost: number
  level: string // DEFAULT / DEBUG / WARNING / ERROR
  input: any
  output: any
  metadata: Record<string, any>
  usage: any
  inputTokens: number
  outputTokens: number
  totalTokens: number
  parentId: string | null
}

/** Trace 详情（含 observations） */
export interface TraceDetail {
  trace: SlimTrace
  observations: SlimObservation[]
}

/** 列表响应 */
export interface TraceListResponse {
  data: SlimTrace[]
  meta: { page: number; limit: number; totalItems: number; totalPages: number }
}
