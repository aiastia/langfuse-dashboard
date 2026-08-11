/**
 * Langfuse API 代理公共辅助。
 * 密钥从 CF Pages 环境变量读取，绝不返回给前端。
 * 全部使用 v2 API 端点（/api/public/v2/observations）。
 */

/** 构造 Langfuse Basic Auth header */
export function authHeader(env) {
  const key = `${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`;
  return 'Basic ' + btoa(key);
}

/** Langfuse API 基础 URL（去掉末尾斜杠） */
export function baseUrl(env) {
  return (env.LANGFUSE_HOST || 'https://cloud.langfuse.com').replace(/\/+$/, '');
}

/** 调 Langfuse API，返回 JSON。出错抛带状态码的 Error。 */
export async function langfuseFetch(env, path, params) {
  let url = baseUrl(env) + path;
  if (params) {
    const sp = new URLSearchParams(params);
    url += '?' + sp.toString();
  }
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Langfuse API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

/** 统一 JSON 响应 + CORS 头
 *  extraHeaders 可追加自定义响应头（如 Cache-Control）。
 */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

/** 统一错误响应 */
export function error(msg, status = 500) {
  return json({ error: msg }, status);
}

/**
 * 边缘运行时短时内存缓存。
 * CF Pages Functions 每个 isolate 存活期内复用全局对象，
 * 命中缓存可避免重复请求上游 Langfuse API，显著缓解冷启动重复调用。
 *
 * @param {string} key   缓存键（通常是请求参数序列化后的字符串）
 * @param {number} ttl   存活时间（毫秒）
 * @param {() => Promise<any>} fetcher  未命中时的数据获取函数
 * @returns {Promise<{data: any, cacheHit: boolean}>}
 */
export async function cached(key, ttl, fetcher) {
  globalThis.__LF_CACHE__ = globalThis.__LF_CACHE__ || new Map();
  const store = globalThis.__LF_CACHE__;
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expire > now) {
    return { data: entry.data, cacheHit: true };
  }
  const data = await fetcher();
  store.set(key, { data, expire: now + ttl });
  if (store.size > 200) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }
  return { data, cacheHit: false };
}

/**
 * 从一组同 traceId 的 v2 observation 行聚合出一个 SlimTrace。
 * v2 没有 trace 级端点，用 observation 行按 traceId 分组重建。
 *
 * @param {string} traceId
 * @param {object[]} obsList  同一 traceId 下的 observation 行（v2 结构）
 * @returns {object} SlimTrace
 */
export function slimTraceFromObservations(traceId, obsList) {
  if (!obsList.length) {
    return {
      id: traceId,
      name: traceId,
      timestamp: '',
      userId: '',
      sessionId: '',
      latency: 0,
      totalCost: 0,
      observationCount: 0,
      runner: '',
      projectId: '',
      chapterNumber: '',
      taskTitle: '',
      tags: [],
      environment: 'default',
    };
  }

  // 按 startTime 找最早/最晚，近似 trace 的时间范围
  const times = obsList
    .map((o) => (o.startTime ? new Date(o.startTime).getTime() : 0))
    .filter((t) => t > 0);
  const minTime = times.length ? Math.min(...times) : 0;
  const maxTime = times.length ? Math.max(...times) : 0;
  const latency = minTime && maxTime ? (maxTime - minTime) / 1000 : 0;

  // trace name：优先用 trace_context.traceName，否则取第一个 observation 的 name
  const name =
    obsList.find((o) => o.traceName)?.traceName ||
    obsList[0].name ||
    traceId;

  // 从第一个含 metadata 的 observation 提取业务字段
  const obsWithMeta = obsList.find((o) => o.metadata);
  const meta = (obsWithMeta && obsWithMeta.metadata) || {};

  // tags 从 trace_context 提取
  const tags = obsList.find((o) => o.tags)?.tags || [];

  return {
    id: traceId,
    name: name || '未命名',
    timestamp: minTime ? new Date(minTime).toISOString() : '',
    userId: obsList.find((o) => o.userId)?.userId || '',
    sessionId: obsList.find((o) => o.sessionId)?.sessionId || '',
    latency,
    totalCost: obsList.reduce((a, o) => a + (o.calculatedTotalCost || 0), 0),
    observationCount: obsList.length,
    runner: meta.runner || '',
    projectId: meta.project_id || '',
    chapterNumber: meta.chapter_number || '',
    taskTitle: meta.task_title || '',
    tags,
    environment: obsList.find((o) => o.environment)?.environment || 'default',
  };
}

/**
 * 精简 v2 observations 端点的返回行（用于 trace 详情）。
 * v2 字段结构与 v1 不同：
 *  - model → providedModelName
 *  - usage → inputUsage / outputUsage / totalUsage
 *  - latency/cost → 在 metrics group
 *  - input/output → 在 io group，返回为 raw string（需尝试 JSON.parse）
 *  - parentId → parentObservationId
 */
export function slimObservationV2(o) {
  function parseIO(raw) {
    if (raw == null) return undefined;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  const usage = {
    input: o.inputUsage || 0,
    output: o.outputUsage || 0,
    total: o.totalUsage || 0,
  };

  return {
    id: o.id,
    type: o.type,
    name: o.name || '',
    model: o.providedModelName || o.internalModelId || '',
    startTime: o.startTime,
    endTime: o.endTime,
    latency: o.calculatedLatency || 0,
    cost: o.calculatedTotalCost || 0,
    level: o.level || 'DEFAULT',
    input: parseIO(o.input),
    output: parseIO(o.output),
    metadata: o.metadata || {},
    usage,
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.total,
    parentId: o.parentObservationId || null,
  };
}
