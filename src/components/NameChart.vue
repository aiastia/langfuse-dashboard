<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const props = defineProps<{
  data: [string, number][]
}>()

const total = computed(() => props.data.reduce((a, d) => a + d[1], 0))

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(77,128,136,0.06)' } },
    backgroundColor: 'rgba(26, 29, 33, 0.92)',
    borderColor: 'transparent',
    borderRadius: 8,
    padding: [8, 12],
    textStyle: { color: '#fff', fontSize: 13 },
    formatter: (params: any) => {
      const p = params[0]
      const pct = total.value > 0 ? ((p.value / total.value) * 100).toFixed(1) : '0'
      return `<div style="font-weight:600;margin-bottom:2px">${p.name}</div><div style="color:#6BAEB8">${p.value} 次 (${pct}%)</div>`
    },
  },
  grid: { left: 110, right: 30, top: 10, bottom: 24 },
  xAxis: {
    type: 'value',
    minInterval: 1,
    splitLine: { lineStyle: { color: '#F0F1F4', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8A9099', fontSize: 12 },
  },
  yAxis: {
    type: 'category',
    data: props.data.map((d) => d[0]).reverse(),
    axisLine: { lineStyle: { color: '#E8EAED' } },
    axisTick: { show: false },
    axisLabel: {
      color: '#535965',
      fontSize: 12,
      fontWeight: 500,
      width: 100,
      overflow: 'truncate',
    },
  },
  series: [
    {
      type: 'bar',
      data: props.data.map((d) => d[1]).reverse().map((_, i, arr) => {
        // 渐变色：排名越靠前颜色越深
        const idx = arr.length - 1 - i
        const ratio = idx / Math.max(arr.length - 1, 1)
        const opacity = 1 - ratio * 0.55
        return {
          value: arr[i],
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: `rgba(77,128,136,${opacity * 0.6})` },
                { offset: 1, color: `rgba(107,174,184,${opacity})` },
              ],
            },
            borderRadius: [0, 6, 6, 0],
          },
        }
      }),
      barWidth: '55%',
    },
  ],
}))
</script>

<template>
  <VChart :option="option" autoresize style="height: 280px;" />
</template>
