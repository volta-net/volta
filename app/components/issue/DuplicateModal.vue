<script setup lang="ts">
const props = defineProps<{
  issueUrl: string
  repoFullName?: string
  issueNumber?: number
}>()

const emit = defineEmits<{
  (e: 'closed'): void
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const closing = ref(false)
const searchTerm = ref('')
const selectedIssue = ref<string | null>(null)

// Debounced search
const debouncedSearch = refDebounced(searchTerm, 300)

// Search issues in the same repo
const { data: searchResults } = await useLazyFetch('/api/issues/search', {
  query: computed(() => ({
    q: debouncedSearch.value,
    repo: props.repoFullName,
    limit: 20
  })),
  default: () => [],
  watch: [debouncedSearch],
  immediate: false
})

const groups = computed(() => [{
  id: 'issues',
  items: (searchResults.value ?? [])
    .filter(issue => issue.number !== props.issueNumber)
    .map(issue => ({
      label: `#${issue.number} ${issue.title}`,
      value: String(issue.number),
      icon: issue.state === 'open' ? 'i-lucide-circle-dot' : 'i-lucide-circle-check',
      avatar: issue.user
        ? {
            src: issue.user.avatarUrl!,
            alt: issue.user.login
          }
        : undefined
    }))
}])

watch(open, (isOpen) => {
  if (isOpen) {
    selectedIssue.value = null
    searchTerm.value = ''
  }
})

async function handleClose() {
  if (!props.issueUrl || !selectedIssue.value || closing.value) return

  closing.value = true
  try {
    await $fetch(`${props.issueUrl}/state`, {
      method: 'PATCH',
      body: {
        state: 'closed',
        stateReason: 'not_planned',
        duplicateOf: parseInt(selectedIssue.value)
      }
    })

    open.value = false
    toast.add({ title: `Issue closed as duplicate of #${selectedIssue.value}`, icon: 'i-lucide-copy' })
    emit('closed')
  } catch (err: any) {
    toast.add({ title: 'Failed to close issue', description: err.data?.message || err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    closing.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <UCommandPalette
        v-model="selectedIssue"
        v-model:search-term="searchTerm"
        :groups="groups"
        value-key="value"
        placeholder="Search issues..."
        close
        class="h-80"
        :ui="{ footer: 'px-2.5 py-2 flex justify-end' }"
        @update:open="open = $event"
      >
        <template #footer>
          <UButton
            label="Close as duplicate"
            :loading="closing"
            :disabled="!selectedIssue"
            @click="handleClose"
          />
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
