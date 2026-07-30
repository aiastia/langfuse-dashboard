import { langfuseFetch, json, error, slimTrace, slimObservation } from '../../_langfuse.js';

/** GET /api/traces/:id — trace 详情（含所有 observation 的完整 input/output）
 *
 *  Langfuse v4 的 trace 详情端点不再返回 observation id 列表，
 *  改用 v2 observations 列表端点按 traceId 查询拿到 id 列表，
 *  再逐个调旧版 observation 详情端点（返回完整 input/output/model/usage）。
 */
export async function onRequestGet(ctx) {
  const { env, params } = ctx;
  const traceId = params.id;

  try {
    // 1. 用 v2 observations 端点按 traceId 拿该 trace 下所有 observation 的 id
    //    v2 列表端点不返回 input/output 大字段，只用来拿 id 列表
    const obsIds = [];
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const q = { traceId, limit: 100 };
      if (cursor) q.cursor = cursor;
      const batch = await langfuseFetch(env, '/api/public/v2/observations', q);
      for (const o of batch.data || []) {
        obsIds.push(o.id);
      }
      cursor = batch.meta?.cursor || batch.meta?.nextCursor || null;
      if (!cursor || !(batch.data || []).length) break;
    }

    // 2. 批量拉每个 observation 的完整详情（旧版端点返回 input/output/model/usage）
    const obsPromises = obsIds.map((id) =>
      langfuseFetch(env, `/api/public/observations/${id}`)
        .then(slimObservation)
        .catch(() => null),
    );
    const observations = (await Promise.all(obsPromises)).filter(Boolean);

    // 3. 按 startTime 排序
    observations.sort((a, b) => {
      const ta = new Date(a.startTime || 0).getTime();
      const tb = new Date(b.startTime || 0).getTime();
      return ta - tb;
    });

    // 4. trace 基本信息：从列表端点取（详情端点 v4 不可用）
    //    用 observations 自身数据组装一个最小 trace 摘要
    const firstObs = observations[0] || {};
    const totalLatency = observations.reduce((a, o) => Math.max(a, o.latency || 0), 0);
    const traceSummary = {
      id: traceId,
      name: observations.find((o) => o.type === 'TRACE')?.name || firstObs.name || traceId,
      observations: observations.length,
      latency: totalLatency,
    };

    return json({ trace: traceSummary, observations });
  } catch (e) {
    return error(e.message, 502);
  }
}
