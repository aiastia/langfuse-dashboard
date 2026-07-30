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

const colors = ['#4D8088', '#6BAEB8', '#8FCAD1', '#B5DDE2', '#D4EBEE', '#E8F4F6', '#F0D9B5', '#E0B886', '#CC9860', '#B57A3D']

const option = computed(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 100, right: 30, top: 10, bottom: 20 },
  xAxis: {
    type: 'value',
    minInterval: 1,
    splitLine: { lineStyle: { color: '#f0f0f0' } },
    axisLabel: { color: '#8c8c8c', fontSize: 12 },
  },
  yAxis: {
    type: 'category',
    data: props.data.map((d) => d[0]).reverse(),
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisLabel: { color: '#595959', fontSize: 12 },
  },
  series: [
    {
      type: 'bar',
      data: props.data.map((d) => d[1]).reverse().map((v, i) => ({
        value: v,
        itemStyle: { color: colors[i % colors.length], borderRadius: [0, 4, 4, 0] },
      })),
      barWidth: '60%',
    },
  ],
}))
</script>

<template>
  <VChart :option="option" autoresize style="height: 280px;" />
</template>
