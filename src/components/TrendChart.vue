<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{
  data: { date: string; label: string; count: number }[]
}>()

const avgValue = computed(() => {
  if (!props.data.length) return 0
  const sum = props.data.reduce((a, d) => a + d.count, 0)
  return Math.round((sum / props.data.length) * 10) / 10
})

const option = computed(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(26, 29, 33, 0.92)',
    borderColor: 'transparent',
    borderRadius: 8,
    padding: [8, 12],
    textStyle: { color: '#fff', fontSize: 13 },
    axisPointer: {
      type: 'line',
      lineStyle: { color: '#4D8088', type: 'dashed', width: 1 },
    },
    formatter: (params: any) => {
      const p = params[0]
      return `<div style="font-weight:600;margin-bottom:2px">${p.axisValue}</div><div style="color:#6BAEB8">调用 ${p.value} 次</div>`
    },
  },
  grid: { left: 45, right: 24, top: 24, bottom: 32 },
  xAxis: {
    type: 'category',
    data: props.data.map((d) => d.label),
    axisLine: { lineStyle: { color: '#E8EAED' } },
    axisTick: { show: false },
    axisLabel: { color: '#8A9099', fontSize: 12 },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    splitLine: { lineStyle: { color: '#F0F1F4', type: 'dashed' } },
    axisLabel: { color: '#8A9099', fontSize: 12 },
  },
  series: [
    {
      data: props.data.map((d) => d.count),
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: {
        color: '#4D8088',
        width: 3,
        shadowColor: 'rgba(77,128,136,0.3)',
        shadowBlur: 8,
        shadowOffsetY: 3,
      },
      itemStyle: {
        color: '#4D8088',
        borderColor: '#fff',
        borderWidth: 2,
      },
      emphasis: {
        itemStyle: {
          color: '#4D8088',
          borderColor: '#fff',
          borderWidth: 2,
          shadowColor: 'rgba(77,128,136,0.5)',
          shadowBlur: 10,
        },
      },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(77,128,136,0.25)' },
            { offset: 0.5, color: 'rgba(77,128,136,0.08)' },
            { offset: 1, color: 'rgba(77,128,136,0)' },
          ],
        },
      },
      markLine: avgValue.value > 0 ? {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#FAAD14', type: 'dashed', width: 1.5, opacity: 0.6 },
        label: {
          formatter: `均值 ${avgValue.value}`,
          color: '#FAAD14',
          fontSize: 11,
          position: 'insideEndTop',
        },
        data: [{ yAxis: avgValue.value }],
      } : undefined,
    },
  ],
}))
</script>

<template>
  <VChart :option="option" autoresize style="height: 280px;" />
</template>
