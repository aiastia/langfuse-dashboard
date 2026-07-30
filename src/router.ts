import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import TraceList from './views/TraceList.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard, meta: { title: '统计面板' } },
    { path: '/traces', name: 'traces', component: TraceList, meta: { title: '调用记录' } },
  ],
})
