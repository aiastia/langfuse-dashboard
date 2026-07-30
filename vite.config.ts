import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 本地开发时 /api 请求代理到 wrangler pages dev（默认 8788 端口）
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
})
