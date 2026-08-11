import { langfuseFetch, json, error, slimObservationV2 } from '../../_langfuse.js';

/** GET /api/traces/:id — trace 详情（含所有 observation 的完整 input/output）
 *
 *  改用 v2 observations 端点 + fields 参数一次性拿全部 observation 详情，
 *  彻底替代旧的 N+1 方案（逐个调 /api/public/observations/:id）。
 *
 *  v2 端点 field groups:
 *    core(always) = id, traceId, startTime, endTime, projectId, parentObservationId, type
 *    basic        = name
 *    io           = input, output
 *    model        = providedModelName 等
 *    usage        = inputUsage, outputUsage, totalUsage, cost
 *    metrics      = latency, cost 汇总
 *
 *  分页：cursor-based，取 meta.cursor 传直到无返回。
 */
export async function onRequestGet(ctx) {
  const { env, params } = ctx;
  const traceId = params.id;

  try {
    // 一次性拉该 trace 下所有 observation（含完整 input/output），cursor 分页
    const observations = [];
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const q = {
        traceId,
        limit: 100,
        fields: 'basic,io,model,usage,metrics,metadata',
      };
      if (cursor) q.cursor = cursor;
      const batch = await langfuseFetch(env, '/api/public/v2/observations', q);
      for (const o of batch.data || []) {
        observations.push(slimObservationV2(o));
      }
      cursor = batch.meta?.cursor || null;
      if (!cursor || !(batch.data || []).length) break;
    }

    // 按 startTime 排序
    observations.sort((a, b) => {
      const ta = new Date(a.startTime || 0).getTime();
      const tb = new Date(b.startTime || 0).getTime();
      return ta - tb;
    });

    // trace 基本信息：从 observations 组装最小摘要
    const firstObs = observations[0] || {};
    const totalLatency = observations.reduce(
      (a, o) => Math.max(a, o.latency || 0),
      0
    );
    const traceSummary = {
      id: traceId,
      name:
        observations.find((o) => o.type === 'TRACE')?.name ||
        firstObs.name ||
        traceId,
      observations: observations.length,
      latency: totalLatency,
    };

    return json({ trace: traceSummary, observations });
  } catch (e) {
    return error(e.message, 502);
  }
}
