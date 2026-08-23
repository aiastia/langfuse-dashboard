import { error } from './_langfuse.js';

/**
 * 全站访问密码中间件（CF Pages Functions）。
 *
 * 根级 _middleware.js 会拦截站点所有请求（含静态资源），
 * 这里只对 /api/* 做密码校验，其余请求（SPA 静态资源、密码页本身）
 * 直接放行 next() —— 密码页必须在无密码时可访问。
 *
 * 校验规则：请求头 X-Access-Key 必须等于环境变量 ACCESS_PASSWORD，
 * 未设置该变量时默认 '123456'。不匹配返回 401 + JSON 错误。
 *
 * 部署时在 CF Pages → Settings → Environment Variables 配置：
 *   ACCESS_PASSWORD = 你的访问密码
 */
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    const expected = String(env.ACCESS_PASSWORD || '123456');
    const provided = request.headers.get('X-Access-Key') || '';
    if (!provided || !timingSafeEqual(provided, expected)) {
      return error('密码不对，请重新输入', 401);
    }
  }

  return next();
}

/** 常量时间字符串比较，避免逐字符短路造成时序侧信道 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
