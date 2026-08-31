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
 * 从 v2 observation 行解析 6 项 token 用量拆解。
 *
 * Langfuse 约定（model-usage-and-cost 文档）：
 *  - usageDetails 是开放 map：input 不含缓存、output 不含思考，各桶互斥，
 *    total = 所有非 total 桶之和。
 *  - 键名随接入端而异，按候选键名模糊取值：
 *    · Langfuse 归一化键：input / output / input_cached_tokens …（Langfuse SDK 探针）
 *    · OpenAI 原始键：prompt_tokens / completion_tokens / total_tokens …
 *      （book 后端走 OpenLLMetry OTel 自动探针，2026-08-31 实测上游存的就是这套）。
 *      Langfuse 不识别这些键，扁平字段 inputUsage/outputUsage 会被算成 0，
 *      totalUsage 只跟随 usageDetails.total——所以必须从 usageDetails 原样解析。
 *  - OpenAI SDK 原生嵌套明细 prompt_tokens_details.cached_tokens /
 *    completion_tokens_details.reasoning_tokens 也一并读取。
 *  - usageDetails 缺失时退回 usage 组的扁平字段 inputUsage/outputUsage。
 *
 * 返回：{ input, cache, totalInput, output, reasoning, totalOutput, total }
 *   输入(未缓存) / 输入缓存 / 总输入 / 输出(未思考) / 思考 / 总输出 / 总计
 */
const INPUT_KEYS = ['input', 'input_tokens', 'prompt_tokens', 'inputTokens', 'promptTokens'];
const OUTPUT_KEYS = ['output', 'output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens'];
const CACHE_READ_KEYS = [
  'inputCacheRead', 'input_cached_tokens', 'inputCachedTokens',
  'cache_read_input_tokens', 'input_cache_read', 'cached_tokens',
];
const CACHE_WRITE_KEYS = [
  'inputCacheWrite', 'input_cache_write', 'inputCachedWriteTokens',
  'cache_creation_input_tokens',
];
const REASONING_KEYS = [
  'outputReasoning', 'output_reasoning_tokens', 'outputReasoningTokens',
  'reasoning_tokens', 'output_reasoning',
];

export function tokenBreakdown(o) {
  const ud = o.usageDetails || {};
  const pick = (keys) => keys.reduce((a, k) => a + (Number(ud[k]) || 0), 0);

  // input/output 的候选键互为别名，同一份 usageDetails 只会出现其中一套，
  // 取第一个非零值，避免别名并存时重复累加
  const firstNonZero = (keys) => {
    for (const k of keys) {
      const v = Number(ud[k]) || 0;
      if (v) return v;
    }
    return 0;
  };
  // OpenAI SDK 原生嵌套明细（缓存/思考不摊进顶层 prompt_tokens/completion_tokens）
  const promptDetails = ud.prompt_tokens_details || ud.input_tokens_details || {};
  const completionDetails = ud.completion_tokens_details || ud.output_tokens_details || {};

  const input = firstNonZero(INPUT_KEYS) || Number(o.inputUsage) || 0;
  const output = firstNonZero(OUTPUT_KEYS) || Number(o.outputUsage) || 0;
  const cache =
    pick(CACHE_READ_KEYS) +
    pick(CACHE_WRITE_KEYS) +
    (Number(promptDetails.cached_tokens) || 0);
  const reasoning = pick(REASONING_KEYS) + (Number(completionDetails.reasoning_tokens) || 0);

  return {
    input,
    cache,
    totalInput: input + cache,
    output,
    reasoning,
    totalOutput: output + reasoning,
    total: input + cache + output + reasoning,
  };
}

/** 空的 token 拆解（列表聚合的初始值） */
export function emptyTokenBreakdown() {
  return {
    input: 0, cache: 0, totalInput: 0,
    output: 0, reasoning: 0, totalOutput: 0, total: 0,
  };
}

/**
 * 从 metadata 对象按精确键名取非空字符串值。
 * 业务字段（project_id/chapter_number/runner/task_title）均为字符串，可能为空串；
 * metadata 里同时混有 resourceAttributes/scope 等 SDK 注入的非业务键，
 * 必须按键名精确取，不能假设"第一个带 metadata 的 observation"就是业务数据。
 */
function metaStr(meta, key) {
  if (!meta || typeof meta !== 'object') return '';
  const v = meta[key];
  if (v == null) return '';
  return String(v).trim();
}

/**
 * 遍历一组 observation，按精确键名聚合业务字段：
 * 每个 observation 的 metadata 只要在该键上有非空值就参与（取第一个非空）。
 * 后端已把业务字段 propagate 到每个 observation，逐行按键聚合最稳。
 */
function pickMetaFields(obsList, keys) {
  const out = {};
  for (const k of keys) out[k] = '';
  for (const o of obsList) {
    const meta = o.metadata;
    if (!meta || typeof meta !== 'object') continue;
    for (const k of keys) {
      if (!out[k]) out[k] = metaStr(meta, k);
    }
  }
  return out;
}

/**
 * 从 trace tags 里解析 "prefix:N" 形式的值（如 project:31 / chapter:4）。
 */
function tagValue(tags, prefix) {
  if (!Array.isArray(tags)) return '';
  for (const t of tags) {
    if (typeof t === 'string' && t.startsWith(prefix)) {
      const v = t.slice(prefix.length).trim();
      if (v) return v;
    }
  }
  return '';
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
  const tokens = emptyTokenBreakdown();
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
      usage: tokens,
    };
  }

  // trace 时长 = 最早 startTime → 最晚 endTime 的墙钟时间
  const startTimes = obsList
    .map((o) => (o.startTime ? new Date(o.startTime).getTime() : 0))
    .filter((t) => t > 0);
  const endTimes = obsList
    .map((o) => (o.endTime ? new Date(o.endTime).getTime() : 0))
    .filter((t) => t > 0);
  const minTime = startTimes.length ? Math.min(...startTimes) : 0;
  const maxTime = endTimes.length ? Math.max(...endTimes) : 0;
  const latency = minTime && maxTime && maxTime > minTime ? (maxTime - minTime) / 1000 : 0;

  // trace name：优先用 trace_context.traceName，否则取第一个 observation 的 name
  const name =
    obsList.find((o) => o.traceName)?.traceName ||
    obsList[0].name ||
    traceId;

  // tags 从 trace_context 提取
  const tags = obsList.find((o) => o.tags)?.tags || [];

  // token 6 项汇总
  for (const o of obsList) {
    const tk = tokenBreakdown(o);
    for (const k of Object.keys(tokens)) tokens[k] += tk[k] || 0;
  }

  // 业务字段跨 observation 按键聚合（每个 observation 都有 metadata，
  // 且混有 resourceAttributes/scope 等非业务键，不能只看第一个）
  const biz = pickMetaFields(obsList, ['project_id', 'chapter_number', 'runner', 'task_title']);
  const sessionId = obsList.find((o) => o.sessionId)?.sessionId || '';

  // 取值链：
  //  projectId    metadata.project_id → tags "project:N" → sessionId（恒等于 project_id，兜底）
  //  chapterNumber metadata.chapter_number → tags "chapter:N" → 空
  const projectId = biz.project_id || tagValue(tags, 'project:') || sessionId || '';
  const chapterNumber = biz.chapter_number || tagValue(tags, 'chapter:') || '';

  return {
    id: traceId,
    name: name || '未命名',
    timestamp: minTime ? new Date(minTime).toISOString() : '',
    userId: obsList.find((o) => o.userId)?.userId || '',
    sessionId,
    latency,
    totalCost: obsList.reduce((a, o) => a + (Number(o.calculatedTotalCost ?? o.totalCost) || 0), 0),
    observationCount: obsList.length,
    runner: biz.runner || '',
    projectId,
    chapterNumber,
    taskTitle: biz.task_title || '',
    tags,
    environment: obsList.find((o) => o.environment)?.environment || 'default',
    usage: tokens,
  };
}

/**
 * 精简 v2 observations 端点的返回行（用于 trace 详情）。
 * v2 字段结构与 v1 不同：
 *  - model → providedModelName
 *  - usage → usageDetails（明细 map）+ inputUsage/outputUsage/totalUsage（扁平汇总）
 *  - latency → metrics 组的 latency（旧名 calculatedLatency 已废弃），
 *    缺失时用 endTime-startTime 兜底
 *  - cost → calculatedTotalCost / totalCost（均为 string 或 number）
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

  const startTime = o.startTime ? new Date(o.startTime).getTime() : 0;
  const endTime = o.endTime ? new Date(o.endTime).getTime() : 0;
  const latency =
    Number(o.latency ?? o.calculatedLatency) ||
    (endTime > startTime ? (endTime - startTime) / 1000 : 0);

  // 思考内容：业务端记录在 metadata.reasoning_content（v2 API 无独立 reasoning 字段），
  // 提为顶层字段并从 metadata 中移除，前端单独成块展示
  const meta = o.metadata && typeof o.metadata === 'object' ? { ...o.metadata } : {};
  const reasoningContent =
    typeof meta.reasoning_content === 'string' ? meta.reasoning_content : '';
  delete meta.reasoning_content;

  return {
    id: o.id,
    type: o.type,
    name: o.name || '',
    // v2 返回的模型名字段：探针上报在 providedModelName，服务端解析在 model
    model: o.providedModelName || o.model || o.internalModelId || '',
    startTime: o.startTime,
    endTime: o.endTime,
    latency,
    cost: Number(o.calculatedTotalCost ?? o.totalCost) || 0,
    level: o.level || 'DEFAULT',
    statusMessage: o.statusMessage || '',
    input: parseIO(o.input),
    output: parseIO(o.output),
    metadata: meta,
    reasoningContent,
    usage: tokenBreakdown(o),
    usageDetails: o.usageDetails || null,
    parentId: o.parentObservationId || null,
  };
}
