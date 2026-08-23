import { json } from '../_langfuse.js';

/**
 * GET /api/verify — 访问密码校验端点。
 *
 * 本身不做任何校验逻辑：密码由根级 _middleware.js 统一拦截，
 * 请求能走到这里就说明 X-Access-Key 正确（错误会先被 401 挡掉）。
 * 前端密码门用它做"提交即验证"，避免为验证密码去拉真实数据。
 */
export async function onRequestGet() {
  return json({ ok: true });
}
