/** Token 6 项拆解（Langfuse 各桶互斥：input 不含缓存，output 不含思考） */
export interface TokenBreakdown {
  input: number // 输入（未命中缓存的部分）
  cache: number // 输入缓存（读 + 写）
  totalInput: number // 总输入 = 输入 + 输入缓存
  output: number // 输出（非思考部分）
  reasoning: number // 思考（reasoning tokens）
  totalOutput: number // 总输出 = 输出 + 思考
  total: number // 总计 = 总输入 + 总输出
}

/** Trace 列表项（精简后） */
export interface SlimTrace {
  id: string
  name: string
  timestamp: string
  userId: string
  sessionId: string
  latency: number // 秒（trace 墙钟耗时）
  totalCost: number
  observationCount: number
  runner: string
  projectId: string
  chapterNumber: string
  taskTitle: string
  tags: string[]
  environment: string
  usage: TokenBreakdown
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
  statusMessage: string // level=ERROR 时的错误信息
  input: any
  output: any
  metadata: Record<string, any>
  reasoningContent: string // 思考过程正文（业务端记录在 metadata.reasoning_content，后端提取）
  usage: TokenBreakdown
  usageDetails: Record<string, number> | null // 原始 usage 明细（调试用）
  parentId: string | null
}

/** Trace 详情（含 observations） */
export interface TraceDetail {
  trace: {
    id: string
    name: string
    observations: number
    latency: number
    usage: TokenBreakdown
  }
  observations: SlimObservation[]
}

/** 列表响应（v2 cursor 分页） */
export interface TraceListResponse {
  data: SlimTrace[]
  meta: {
    limit: number
    nextCursor: string | null
    hasMore: boolean
    totalReturned: number
    totalObsSeen?: number
  }
}
