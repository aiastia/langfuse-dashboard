import {
  langfuseFetch,
  json,
  error,
  cached,
  slimTraceFromObservations,
} from '../_langfuse.js';

/** GET /api/traces — trace 列表（全部使用 v2 observations 端点）
 *
 *  Langfuse 废弃了 /api/public/traces，且未提供 /api/public/v2/traces 替代。
 *  官方要求改用 /api/public/v2/observations 按 traceId 分组重建 trace 数据。
 *
 *  查询参数（前端 → v2 observations 参数映射）:
 *   - limit (每页 trace 数，默认 50)
 *   - cursor (分页游标，来自上次返回的 meta.nextCursor)
 *   - fromTimestamp → fromStartTime
 *   - toTimestamp → toStartTime
 *   - name → name（observation name 近似匹配）
 *   - userId → userId
 *
 *  带 30 秒短时缓存。
 */
export async function onRequestGet(ctx) {
  const { env } = ctx;
  const url = new URL(ctx.request.url);

  // 前端传的参数
  const traceLimit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const cursor = url.searchParams.get('cursor');
  const name = url.searchParams.get('name');
  const userId = url.searchParams.get('userId');
  const fromTimestamp = url.searchParams.get('fromTimestamp');
  const toTimestamp = url.searchParams.get('toTimestamp');

  // 缓存键
  const cacheKey =
    'traces:' +
    JSON.stringify({ traceLimit, cursor, name, userId, fromTimestamp, toTimestamp });

  try {
    const { data } = await cached(cacheKey, 30000, () =>
      fetchTracesFromV2(env, { traceLimit, cursor, name, userId, fromTimestamp, toTimestamp })
    );
    return json(data, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) {
    return error(e.message, 502);
  }
}

/**
 * 从 v2 observations 端点拉取 observation 行，按 traceId 分组重建 trace 列表。
 *
 * 策略：v2 按 startTime 降序返回 observation 行，同一 trace 的行分散在结果中。
 * 用 Map 按 traceId 收集，直到不同 traceId 数量达到 traceLimit 或翻完所有页。
 * 为保证同一 trace 的所有 observation 行都被收集到，
 * 在达到 traceLimit 后再多拉一页（边界 trace 的行可能未完整收集）。
 */
async function fetchTracesFromV2(env, opts) {
  const { traceLimit, cursor, name, userId, fromTimestamp, toTimestamp } = opts;

  // v2 每次请求拉 100 条 observation 行
  const obsPerRequest = 100;
  const maxPages = 10; // 最多翻 10 页 = 1000 行，防止无限拉取

  // 按 traceId 分组收集 observation 行
  const traceMap = new Map(); // traceId → observation[]
  let nextCursor = cursor || null;
  let page = 0;
  let totalObsSeen = 0;

  while (page < maxPages) {
    const params = {
      limit: obsPerRequest,
      fields: 'basic,metrics,trace_context,metadata',
      orderBy: 'startTime-desc',
    };
    if (nextCursor) params.cursor = nextCursor;
    if (name) params.name = name;
    if (userId) params.userId = userId;
    if (fromTimestamp) params.fromStartTime = fromTimestamp;
    if (toTimestamp) params.toStartTime = toTimestamp;

    const batch = await langfuseFetch(env, '/api/public/v2/observations', params);
    const rows = batch.data || [];

    for (const row of rows) {
      const tid = row.traceId;
      if (!traceMap.has(tid)) traceMap.set(tid, []);
      traceMap.get(tid).push(row);
    }
    totalObsSeen += rows.length;

    nextCursor = batch.meta?.cursor || null;

    // 停止条件：无更多数据，或已收集够 trace 数且至少拉了一页
    page++;
    if (!nextCursor || !rows.length) break;
    if (traceMap.size >= traceLimit && page > 1) break;
  }

  // 按 trace 最早 observation 时间降序排列（最近的在前）
  const traceIds = [...traceMap.keys()];
  const traces = traceIds
    .map((tid) => slimTraceFromObservations(tid, traceMap.get(tid)))
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

  // 截取到请求的 trace 数量
  const pagedTraces = traces.slice(0, traceLimit);

  return {
    data: pagedTraces,
    meta: {
      limit: traceLimit,
      nextCursor: nextCursor || null,
      hasMore: nextCursor != null,
      totalReturned: pagedTraces.length,
      totalObsSeen,
    },
  };
}
