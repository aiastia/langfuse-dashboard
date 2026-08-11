/**
 * Langfuse API 代理公共辅助。
 * 密钥从 CF Pages 环境变量读取，绝不返回给前端。
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
  // isolate 级全局缓存表（首次调用时初始化）
  globalThis.__LF_CACHE__ = globalThis.__LF_CACHE__ || new Map();
  const store = globalThis.__LF_CACHE__;
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expire > now) {
    return { data: entry.data, cacheHit: true };
  }
  const data = await fetcher();
  store.set(key, { data, expire: now + ttl });
  // 简易清理：超过 200 条时删除最旧的，防止内存膨胀
  if (store.size > 200) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }
  return { data, cacheHit: false };
}

/** 统一错误响应 */
export function error(msg, status = 500) {
  return json({ error: msg }, status);
}

// 精简 trace 列表项：去掉 OTel 内部字段，只留前端需要的
export function slimTrace(t) {
  const meta = t.metadata || {};
  return {
    id: t.id,
    name: t.name || '未命名',
    timestamp: t.timestamp,
    userId: t.userId || '',
    sessionId: t.sessionId || '',
    latency: t.latency || 0,
    totalCost: t.totalCost || 0,
    observationCount: (t.observations || []).length,
    // 从 metadata 提取业务字段
    runner: meta.runner || '',
    projectId: meta.project_id || '',
    chapterNumber: meta.chapter_number || '',
    taskTitle: meta.task_title || '',
    tags: t.tags || [],
    environment: t.environment || 'default',
  };
}

// 精简 observation 详情
export function slimObservation(o) {
  return {
    id: o.id,
    type: o.type, // TRACE / SPAN / GENERATION
    name: o.name || '',
    model: o.model || '',
    startTime: o.startTime,
    endTime: o.endTime,
    latency: o.calculatedLatency || 0,
    cost: o.calculatedTotalCost || 0,
    level: o.level || 'DEFAULT',
    input: o.input,
    output: o.output,
    metadata: o.metadata || {},
    usage: o.usage || null,
    // 找出 input/output 的 token 数
    inputTokens: o.usage?.input || 0,
    outputTokens: o.usage?.output || 0,
    totalTokens: o.usage?.total || 0,
    parentId: o.parentId || null,
  };
}
