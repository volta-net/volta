<script setup lang="ts">
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

const defaultColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16']

function getColor(index: number, explicit?: string) {
  return explicit || defaultColors[index % defaultColors.length]!
}

// Donut: simple number[] + categories
const donutData = computed(() => props.result.data?.map(d => d.value) ?? [])
const donutCategories = computed(() => {
  return Object.fromEntries(
    (props.result.data ?? []).map((d, i) => [d.label, { name: d.label, color: getColor(i, d.color) }])
  )
})

// Bar/Line/Area with series: build data array of objects and categories record
const seriesData = computed(() => {
  if (!props.result.xLabels || !props.result.series) return []
  return props.result.xLabels.map((label, i) => {
    const point: Record<string, string | number> = { _x: label }
    for (const s of props.result.series!) {
      point[s.name] = s.values[i] ?? 0
    }
    return point
  })
})

const seriesCategories = computed(() => {
  if (!props.result.series) return {}
  return Object.fromEntries(
    props.result.series.map(s => [s.name, { name: s.name, color: s.color }])
  )
})

const seriesYAxis = computed(() => props.result.series?.map(s => s.name) ?? [])

const seriesXFormatter = computed(() => {
  const labels = props.result.xLabels ?? []
  return (i: number) => labels[i] ?? ''
})

// Single-series bar fallback (donut-style data used in a bar chart)
const simpleBarData = computed(() => {
  if (props.result.series) return null
  return (props.result.data ?? []).map(d => ({ _x: d.label, value: d.value }))
})

const simpleBarCategories = computed(() => ({
  value: { name: props.result.title, color: getColor(0, props.result.data?.[0]?.color) }
}))

const simpleBarXFormatter = computed(() => {
  const data = props.result.data ?? []
  return (i: number) => data[i]?.label ?? ''
})

const isSeriesChart = computed(() => !!props.result.series?.length)
</script>

<template>
  <div class="rounded-lg ring ring-default bg-default p-4 w-full">
    <p class="text-sm font-medium text-highlighted mb-3">
      {{ result.title }}
    </p>

    <DonutChart
      v-if="result.type === 'donut'"
      :data="donutData"
      :categories="donutCategories"
      :height="200"
      :arc-width="32"
      :radius="4"
      :pad-angle="0.03"
    />

    <template v-else-if="result.type === 'bar'">
      <BarChart
        v-if="isSeriesChart"
        :data="seriesData"
        :categories="seriesCategories"
        :y-axis="seriesYAxis"
        :height="200"
        :x-formatter="seriesXFormatter"
        :radius="4"
        y-grid-line
      />
      <BarChart
        v-else
        :data="simpleBarData!"
        :categories="simpleBarCategories"
        :y-axis="['value']"
        :height="200"
        :x-formatter="simpleBarXFormatter"
        :radius="4"
        hide-legend
        y-grid-line
      />
    </template>

    <LineChart
      v-else-if="result.type === 'line'"
      :data="seriesData"
      :categories="seriesCategories"
      :height="200"
      :x-formatter="seriesXFormatter"
      :curve-type="CurveType.MonotoneX"
      y-grid-line
    />

    <AreaChart
      v-else-if="result.type === 'area'"
      :data="seriesData"
      :categories="seriesCategories"
      :height="200"
      :x-formatter="seriesXFormatter"
      :curve-type="CurveType.MonotoneX"
      y-grid-line
    />
  </div>
</template>
