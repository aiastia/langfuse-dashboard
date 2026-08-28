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
 *  （2026-08-28 对照官方 OpenAPI 规范复核：v4 官方指定替代端点正是
 *  v2/observations，本文件已是 v4 兼容写法；v1 端点 Cloud 于 2026-11-16 移除。）
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
 * 性能策略：每次 HTTP 请求只拉一页 observation（最多 100 行），
 * 按 traceId 分组后如果不同的 traceId 数量已够 traceLimit 就返回。
 * 最多翻 maxPages 页，防止请求时间过长（CF Function 有 CPU 时间限制）。
 * 前端通过 cursor + 渐进加载 / 重试来补全剩余数据。
 */
async function fetchTracesFromV2(env, opts) {
  const { traceLimit, cursor, name, userId, fromTimestamp, toTimestamp } = opts;

  const obsPerRequest = Math.min(traceLimit * 3, 100); // 每 trace 约 2-3 个 observation
  const maxPages = 3; // 最多翻 3 页，控制单次请求总耗时

  // 按 traceId 分组收集 observation 行
  const traceMap = new Map(); // traceId → observation[]
  let nextCursor = cursor || null;
  let page = 0;

  while (page < maxPages) {
    const params = {
      limit: obsPerRequest,
      fields: 'basic,metrics,usage,trace_context,metadata',
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

    nextCursor = batch.meta?.cursor || null;
    page++;

    // 停止条件：无更多数据，或已收集够 trace 数量
    if (!nextCursor || !rows.length) break;
    if (traceMap.size >= traceLimit) break;
  }

  // 按 trace 最早 observation 时间降序排列（最近的在前）
  const traces = [...traceMap.keys()]
    .map((tid) => slimTraceFromObservations(tid, traceMap.get(tid)))
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    })
    .slice(0, traceLimit);

  return {
    data: traces,
    meta: {
      limit: traceLimit,
      nextCursor: nextCursor || null,
      hasMore: nextCursor != null,
      totalReturned: traces.length,
    },
  };
}
