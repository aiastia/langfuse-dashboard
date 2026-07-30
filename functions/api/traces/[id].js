import { langfuseFetch, json, error, slimTrace, slimObservation } from '../../_langfuse.js';

/** GET /api/traces/:id — trace 详情（含所有 observation 的完整 input/output）
 *  Langfuse trace 详情接口返回 observation id 列表，但不包含 observation 内容。
 *  这里批量拉取每个 observation 的详情，拼好后返回。
 */
export async function onRequestGet(ctx) {
  const { env, params } = ctx;
  const traceId = params.id;

  try {
    // 1. 拉 trace 基本信息
    const trace = await langfuseFetch(env, `/api/public/traces/${traceId}`);
    const obsIds = trace.observations || [];

    // 2. 批量拉每个 observation 的详情
    // Langfuse 没有批量接口，逐个拉（trace 通常 ≤30 个 observation）
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

    return json({
      trace: slimTrace(trace),
      observations,
    });
  } catch (e) {
    return error(e.message, 502);
  }
}
