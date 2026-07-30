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

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: props.data.map((d) => d.label),
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisLabel: { color: '#8c8c8c', fontSize: 12 },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    splitLine: { lineStyle: { color: '#f0f0f0' } },
    axisLabel: { color: '#8c8c8c', fontSize: 12 },
  },
  series: [
    {
      data: props.data.map((d) => d.count),
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#4D8088', width: 2 },
      itemStyle: { color: '#4D8088' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(77,128,136,0.2)' },
            { offset: 1, color: 'rgba(77,128,136,0)' },
          ],
        },
      },
    },
  ],
}))
</script>

<template>
  <VChart :option="option" autoresize style="height: 280px;" />
</template>
