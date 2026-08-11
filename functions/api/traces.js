import { langfuseFetch, json, error, slimTrace, cached } from '../_langfuse.js';

/** GET /api/traces — trace 列表
 *  查询参数（透传给 Langfuse）:
 *   - limit (默认 50，最大 100)
 *   - page (默认 1)
 *   - fromTimestamp / toTimestamp (ISO 日期，筛选时间范围)
 *   - name (任务类型筛选)
 *   - userId / sessionId
 *
 *  带 30 秒短时缓存：CF Pages Function isolate 存活期内复用，
 *  命中缓存直接返回，避免重复请求 Langfuse；浏览器侧也走 HTTP 缓存。
 */
export async function onRequestGet(ctx) {
  const { env } = ctx;
  const url = new URL(ctx.request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const page = parseInt(url.searchParams.get('page') || '1');

  const params = { limit, page };
  for (const key of ['fromTimestamp', 'toTimestamp', 'name', 'userId', 'sessionId', 'orderBy']) {
    const v = url.searchParams.get(key);
    if (v) params[key] = v;
  }

  // 缓存键：固定前缀 + 参数排序序列化，保证相同查询命中同一缓存
  const cacheKey = 'traces:' + JSON.stringify(params);

  try {
    const { data } = await cached(cacheKey, 30000, async () => {
      const raw = await langfuseFetch(env, '/api/public/traces', params);
      return {
        data: (raw.data || []).map(slimTrace),
        meta: raw.meta || { page, limit, totalItems: 0, totalPages: 0 },
      };
    });
    return json(data, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) {
    return error(e.message, 502);
  }
}
