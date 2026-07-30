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

/** 统一 JSON 响应 + CORS 头 */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
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
