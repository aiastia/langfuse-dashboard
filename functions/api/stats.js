import { langfuseFetch, json, error, cached, cachedPersist } from '../_langfuse.js';

/**
 * GET /api/stats — 看板统计数据（服务端聚合，官方 v2 Metrics API）
 *
 * 2026-09-04 改造说明：原先统计卡片是前端把「已加载的 trace 列表」逐条累加，
 * 30 天里只加载了最多几百条 trace，算出来的总量严重偏小。
 * 本端点改用 Langfuse 官方聚合接口 /api/public/v2/metrics?query=<JSON>
 * 在服务端算好精确值再返回（该接口不按天分桶，唯一的时间维度只有
 * startTimeMonth 月粒度，所以趋势图的每日数据用「每天一次单日范围查询」获取）。
 *
 * ⚠️ 配额：v2 metrics 接口对每个 key 限 100 次/天（429 时 resetAt 约 24h 后）。
 * 所以每类查询都做了两层缓存省配额：
 *  - L1 isolate 内存（cached()，和边缘缓存同一套）
 *  - L2 CF Cache API（跨 isolate 持久，同机房生效）：
 *      历史日桶 12h / 今日桶 2min / 范围聚合 10min
 * 为了让 L2 缓存键稳定，查询终点时间对齐到桶边界（今日桶对齐分钟、
 * 聚合对齐 10 分钟），代价是统计最多滞后一个桶长度。
 *
 * 查询参数：
 *  - days: 统计范围 7 | 30（默认 7）
 *  - tz:   浏览器 new Date().getTimezoneOffset() 的值（分钟，UTC+8 为 -480），
 *          用于按用户本地时区切天；缺省按 UTC+8 处理
 *
 * 各测度含义（view=observations）：
 *  - traceId + uniq   → 去重 trace 数，即「调用次数」（一次任务 = 一个 trace）
 *  - usageByType + sum → 自动按 usage 类型（input / input_cached_tokens /
 *    output / output_reasoning_tokens）分行返回 token 用量
 *  - latency + avg，filter type=GENERATION → 真实 LLM 调用平均耗时（毫秒）
 *  - 按 traceName 维度分组 → 任务类型分布
 */
export async function onRequestGet(ctx) {
  const { env } = ctx;
  const url = new URL(ctx.request.url);

  let days = parseInt(url.searchParams.get('days') || '7');
  if (days !== 30) days = 7;
  let tzOff = -parseInt(url.searchParams.get('tz') || '-480'); // 东八区 → +480
  if (!Number.isFinite(tzOff) || Math.abs(tzOff) > 840) tzOff = 480;

  try {
    const data = await cached(`stats:${days}:${tzOff}`, 60000, () =>
      buildStats(env, days, tzOff)
    );
    return json(data.data, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    return error(e.message, 502);
  }
}

/** 查询用户本地时区的「第 i 天」（0=今天）的起止毫秒时间戳 */
function dayBounds(nowMs, tzOff, i) {
  // 把当前时间平移到「用户本地墙钟 = UTC 墙钟」的假 UTC 时间，取整天再平移回去
  const shifted = nowMs + tzOff * 60000;
  const startMs = Math.floor(shifted / 86400000 - i) * 86400000 - tzOff * 60000;
  return { startMs, endMs: startMs + 86400000 };
}

/** 把毫秒时间戳向下对齐到 bucketMs 的整数倍（让缓存键在桶内保持稳定） */
function floorTo(ms, bucketMs) {
  return Math.floor(ms / bucketMs) * bucketMs;
}

/** 调 v2 metrics，返回 data 行数组 */
async function metricsQuery(env, query) {
  const resp = await langfuseFetch(
    env,
    '/api/public/v2/metrics',
    // GET 查询参数是 urlencoded JSON
    { query: JSON.stringify(query) }
  );
  return resp.data || [];
}

/** 单日调用次数（去重 trace 数）。历史日 12h / 今日 2min 缓存，省配额 */
async function dayCount(env, startMs, endMs, isToday) {
  const from = new Date(startMs).toISOString();
  const to = new Date(floorTo(Math.min(endMs, Date.now()), 60000)).toISOString();
  const ttl = isToday ? 120 : 12 * 3600;
  return cached(`stats:day:${from}`, ttl * 1000, () =>
    cachedPersist(`stats-day?from=${from}&to=${to}`, ttl, async () => {
      const rows = await metricsQuery(env, {
        view: 'observations',
        metrics: [{ measure: 'traceId', aggregation: 'uniq' }],
        fromTimestamp: from,
        toTimestamp: to,
      });
      return rows[0]?.uniq_traceId || 0;
    })
  ).then((r) => r.data);
}

/** usageByType 行 → 6 项 token 拆解 */
function breakdownFromUsageRows(rows) {
  const tk = { input: 0, cache: 0, totalInput: 0, output: 0, reasoning: 0, totalOutput: 0, total: 0 };
  for (const r of rows) {
    const v = r.sum_usageByType || 0;
    const t = r.usageType || '';
    if (t === 'input') tk.input += v;
    else if (t === 'output') tk.output += v;
    else if (t.startsWith('input_cache') || t.includes('cached')) tk.cache += v;
    else if (t.includes('reasoning')) tk.reasoning += v;
    // "total" 行是 Langfuse 自己的总和，用各桶之和替代，口径一致
  }
  tk.totalInput = tk.input + tk.cache;
  tk.totalOutput = tk.output + tk.reasoning;
  tk.total = tk.totalInput + tk.totalOutput;
  return tk;
}

async function buildStats(env, days, tzOff) {
  const nowMs = Date.now();
  const today = dayBounds(nowMs, tzOff, 0);
  const rangeStart = dayBounds(nowMs, tzOff, days - 1).startMs;
  // 聚合查询终点对齐 10 分钟，保证缓存键在桶内稳定
  const rangeEnd = Math.min(floorTo(nowMs, 600000), today.endMs);
  const fromISO = new Date(rangeStart).toISOString();
  const toISO = new Date(rangeEnd).toISOString();

  // ---- 范围聚合：token 拆解 / 平均耗时 / 任务类型分布 ----
  // 先发起（不 await），与下面的每日查询同一轮并行，压低冷启动总耗时。
  // 每个查询单独挂持久缓存（10min），切换 7/30 天后回切不重复花配额
  const AGG_TTL = 600;
  const agg = (key, query) =>
    cached(`stats:agg:${key}:${fromISO}:${toISO}`, AGG_TTL * 1000, () =>
      cachedPersist(`stats-agg?${key}&from=${fromISO}&to=${toISO}`, AGG_TTL, () =>
        metricsQuery(env, query)
      )
    );
  const aggPromise = Promise.all([
    agg('usage', {
      view: 'observations',
      metrics: [{ measure: 'usageByType', aggregation: 'sum' }],
      fromTimestamp: fromISO,
      toTimestamp: toISO,
    }),
    agg('latency', {
      view: 'observations',
      metrics: [{ measure: 'latency', aggregation: 'avg' }],
      filters: [{ type: 'string', column: 'type', operator: '=', value: 'GENERATION' }],
      fromTimestamp: fromISO,
      toTimestamp: toISO,
    }),
    agg('byname', {
      view: 'observations',
      dimensions: [{ type: 'categorical', field: 'traceName' }],
      metrics: [{ measure: 'traceId', aggregation: 'uniq' }],
      orderBy: [{ field: 'uniq_traceId', direction: 'desc' }],
      fromTimestamp: fromISO,
      toTimestamp: toISO,
    }),
  ]).then((r) => r.map((x) => x.data));

  // ---- 每日调用次数 ----
  // 上游对同 key 的突发并发会排队（实测 30 个并行反而拖到 30s+），
  // 改成每批 5 个的小批量并发，总耗时更稳
  const dayJobs = Array.from({ length: days }, (_, idx) => {
    const i = days - 1 - idx; // 旧 → 新
    const { startMs, endMs } = dayBounds(nowMs, tzOff, i);
    return { i, startMs, endMs };
  });
  const trend = [];
  const BATCH = 5;
  for (let b = 0; b < dayJobs.length; b += BATCH) {
    const part = await Promise.all(
      dayJobs.slice(b, b + BATCH).map(async ({ i, startMs, endMs }) => {
        const count = await dayCount(env, startMs, Math.min(endMs, nowMs), i === 0);
        const d = new Date(startMs + tzOff * 60000);
        return {
          date: new Date(startMs).toISOString(),
          label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
          count,
        };
      })
    );
    trend.push(...part);
  }
  const [usageRows, latencyRows, nameRows] = await aggPromise;

  const tokens = breakdownFromUsageRows(usageRows);
  const avgLatencySec = latencyRows[0]?.avg_latency
    ? Math.round((latencyRows[0].avg_latency / 1000) * 10) / 10
    : 0;
  const byName = nameRows
    .filter((r) => r.traceName)
    .map((r) => [r.traceName, r.uniq_traceId || 0]);

  return {
    days,
    from: fromISO,
    to: toISO,
    todayCalls: trend[trend.length - 1]?.count || 0,
    totalCalls: trend.reduce((a, d) => a + d.count, 0),
    avgLatencySec,
    tokens,
    cacheHitRate: tokens.totalInput
      ? Math.round((tokens.cache / tokens.totalInput) * 1000) / 10
      : null,
    trend,
    byName,
  };
}
