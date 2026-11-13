<script setup lang="ts">
import type { ChartCategory } from '@nuxt/ui'

interface ChartDataPoint {
  label: string
  value: number
  color?: string
}

interface ChartSeries {
  name: string
  color: string
  values: number[]
}

interface ChartResult {
  type: 'donut' | 'bar' | 'line' | 'area'
  title: string
  data?: ChartDataPoint[]
  xLabels?: string[]
  series?: ChartSeries[]
}

const props = defineProps<{
  result: ChartResult
}>()

const isSeriesChart = computed(() => props.result.type !== 'donut' && !!props.result.series?.length)

// Series are keyed by index so a series name can never collide with the `label` key
const data = computed(() => {
  if (!isSeriesChart.value) {
    return (props.result.data ?? []).map(d => ({ label: d.label, value: d.value }))
  }

  return (props.result.xLabels ?? []).map((label, i) => {
    const row: Record<string, string | number> = { label }
    props.result.series!.forEach((s, j) => {
      row[`s${j}`] = s.values[i] ?? 0
    })
    return row
  })
})

const categories = computed<ChartCategory[]>(() => {
  if (!isSeriesChart.value) {
    return [{ key: 'value', label: props.result.title, color: props.result.data?.[0]?.color }]
  }

  return props.result.series!.map((s, j) => ({ key: `s${j}`, label: s.name, color: s.color }))
})

// Donut slices are colored in `data` order, falling back to the theme palette
const donutColors = computed(() => {
  if (props.result.type !== 'donut' || !props.result.data?.some(d => d.color)) return undefined

  return props.result.data.map((d, i) => d.color || `var(--ui-chart-${(i % 6) + 1})`)
})
</script>

<template>
  <div class="rounded-lg ring ring-default bg-default p-4 w-full">
    <p class="text-sm font-medium text-highlighted mb-3">
      {{ result.title }}
    </p>

    <UChart
      :type="result.type"
      :data="data"
      index="label"
      :categories="categories"
      :colors="donutColors"
      :curve="result.type === 'line' || result.type === 'area' ? 'monotone' : 'linear'"
      :thickness="32"
      :height="200"
    />
  </div>
</template>
