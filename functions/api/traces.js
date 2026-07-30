import { langfuseFetch, json, error, slimTrace } from '../_langfuse.js';

/** GET /api/traces — trace 列表
 *  查询参数（透传给 Langfuse）:
 *   - limit (默认 50，最大 100)
 *   - page (默认 1)
 *   - fromTimestamp / toTimestamp (ISO 日期，筛选时间范围)
 *   - name (任务类型筛选)
 *   - userId / sessionId
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

  try {
    const data = await langfuseFetch(env, '/api/public/traces', params);
    return json({
      data: (data.data || []).map(slimTrace),
      meta: data.meta || { page, limit, totalItems: 0, totalPages: 0 },
    });
  } catch (e) {
    return error(e.message, 502);
  }
}
