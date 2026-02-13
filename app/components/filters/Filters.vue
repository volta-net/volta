<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Filter, FilterType } from '~/composables/useFilters'

const props = defineProps<{
  filters: readonly Filter[]
  availableFilters?: Filter[]
}>()

const emit = defineEmits<{
  toggle: [filter: Filter]
  clear: []
}>()

const open = ref(false)
const searchTerm = ref('')

watch(open, (value) => {
  if (!value) {
    searchTerm.value = ''
  }
})

defineShortcuts({
  f: () => open.value = true
})

const filterTypeConfig: Record<FilterType, { label: string, icon: string }> = {
  repository: { label: 'Repository', icon: 'i-lucide-book' },
  label: { label: 'Label', icon: 'i-lucide-tag' },
  actor: { label: 'Author', icon: 'i-lucide-user' },
  ci: { label: 'CI Status', icon: 'i-lucide-circle-play' },
  review: { label: 'Review', icon: 'i-lucide-eye' },
  resolution: { label: 'Resolution', icon: 'i-lucide-sparkles' },
  action: { label: 'Action', icon: 'i-lucide-zap' },
  state: { label: 'State', icon: 'i-lucide-circle' }
}

const filterTypeOrder: FilterType[] = ['repository', 'label', 'actor', 'ci', 'review', 'resolution', 'action', 'state']

function isActive(type: FilterType, value: string) {
  return props.filters.some(f => f.type === type && f.value === value)
}

function toCheckboxItem(f: Filter): DropdownMenuItem {
  return {
    label: f.label,
    type: 'checkbox' as const,
    checked: isActive(f.type, f.value),
    icon: f.icon,
    avatar: f.avatar ? { src: f.avatar, alt: f.label } : undefined,
    ...(f.chip && { slot: 'chip', chip: f.chip }),
    onUpdateChecked() {
      emit('toggle', f)
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }
}

// When searching: flat list of matching items grouped by type
// When browsing: categories with sub-menus
const items = computed<DropdownMenuItem[] | DropdownMenuItem[][]>(() => {
  const available = props.availableFilters ?? []
  const grouped = new Map<FilterType, Filter[]>()
  for (const f of available) {
    const existing = grouped.get(f.type) || []
    existing.push(f)
    grouped.set(f.type, existing)
  }

  const q = searchTerm.value.toLowerCase()

  // Searching: flat list of matching checkbox items, grouped by type
  if (q) {
    return filterTypeOrder
      .filter(type => grouped.has(type))
      .map((type) => {
        const config = filterTypeConfig[type]
        const matches = grouped.get(type)!
          .filter(f => f.label.toLowerCase().includes(q))

        if (!matches.length) return null

        return [
          { label: config.label, type: 'label' as const },
          ...matches.map(toCheckboxItem)
        ]
      })
      .filter(Boolean) as DropdownMenuItem[][]
  }

  // Browsing: categories with sub-menus
  return filterTypeOrder
    .filter(type => grouped.has(type))
    .map((type) => {
      const config = filterTypeConfig[type]
      return {
        label: config.label,
        icon: config.icon,
        children: [grouped.get(type)!.map(toCheckboxItem)]
      }
    })
})
</script>

<template>
  <UFieldGroup class="overflow-x-auto">
    <FiltersButton
      v-for="filter in filters"
      :key="`${filter.type}-${filter.value}`"
      :filter="filter"
      trailing-icon="i-lucide-x"
      @click.stop="emit('toggle', filter)"
    />

    <UDropdownMenu
      v-if="availableFilters?.length"
      v-model:open="open"
      :items="items"
      :content="{ align: 'start' }"
      :ui="{ content: 'max-h-80 overflow-y-auto', item: 'items-center' }"
    >
      <UButton
        icon="i-lucide-filter"
        label="Filter"
        variant="subtle"
        size="xs"
        class="border  border-accented ring-0"
        :class="[filters.length ? 'border-dashed' : '']"
      />

      <template #chip-leading="{ item }">
        <IssueLabelChip :color="(item as any).chip.color" />
      </template>

      <template #content-top="{ sub }">
        <UInput
          v-if="!sub"
          v-model="searchTerm"
          placeholder="Search filters..."
          icon="i-lucide-search"
          variant="soft"
          autofocus
          size="sm"
          :ui="{ root: 'w-full border-b border-default', base: 'rounded-none hover:bg-elevated/50 focus:bg-elevated/50' }"
          @keydown.stop
        />
      </template>
    </UDropdownMenu>
  </UFieldGroup>
</template>
