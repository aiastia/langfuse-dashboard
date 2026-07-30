# AI 可观测性看板（Langfuse Dashboard）

独立的 Langfuse 数据看板，Vue 3 + Ant Design Vue，托管到 Cloudflare Pages。

## 功能

- **统计面板**：今日调用次数、7 天趋势图、任务类型分布
- **调用记录**：trace 列表 + 筛选，点开查看完整调用链（input/output/token/耗时）
- **密钥安全**：Langfuse Secret Key 只存在 CF 后端环境变量，前端不暴露

## 本地开发

```bash
# 1. 配置密钥
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入你的 Langfuse 密钥

# 2. 启动前端 + Functions 代理（两个终端）
npx vite                    # 前端 → http://localhost:5173
npx wrangler pages dev dist # Functions 代理 → http://localhost:8788
```

## 部署到 Cloudflare Pages

### 1. 推到 GitHub
```bash
git init && git add . && git commit -m "init"
# 创建 GitHub 仓库后
git remote add origin <your-repo>
git push -u origin main
```

### 2. CF Pages 连接仓库
1. CF Dashboard → Pages → Create project → Connect to Git
2. 选择仓库，构建配置：
   - **Build command**: `npm run build:fast`
   - **Build output directory**: `dist`
3. 环境变量（Settings → Environment Variables）：
   ```
   LANGFUSE_HOST        = https://jp.cloud.langfuse.com
   LANGFUSE_PUBLIC_KEY  = pk-lf-xxxx
   LANGFUSE_SECRET_KEY  = sk-lf-xxxx
   ```
4. Deploy

### 或用 CLI 部署
```bash
npm run build:fast
npx wrangler pages deploy dist --project-name langfuse-dashboard
```

## 架构

```
浏览器 → CF Pages（Vue SPA）
           ↓ /api/*
     CF Pages Functions（代理，密钥在环境变量）
           ↓ Basic Auth
     Langfuse Cloud API
```

## 技术栈

- Vue 3 + Vue Router + Ant Design Vue 4
- ECharts（vue-echarts）图表
- Cloudflare Pages Functions（API 代理）
- Vite 构建
