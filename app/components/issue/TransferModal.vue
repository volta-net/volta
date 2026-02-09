<script setup lang="ts">
const props = defineProps<{
  issueUrl: string
  repoFullName?: string
  onClose?: () => void
}>()

const emit = defineEmits<{
  (e: 'transferred'): void
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { synced: repos } = useFavoriteRepositories()
const transferring = ref(false)
const selectedRepo = ref<string | null>(null)

const groups = computed(() => [{
  id: 'repositories',
  items: repos.value
    .filter(r => r.fullName !== props.repoFullName)
    .map(repo => ({
      label: repo.fullName,
      value: repo.fullName,
      icon: repo.private ? 'i-lucide-lock' : 'i-lucide-book',
      avatar: {
        src: `https://github.com/${repo.fullName.split('/')[0]}.png`
      }
    }))
}])

watch(open, (isOpen) => {
  if (isOpen) {
    selectedRepo.value = null
  }
})

async function handleTransfer() {
  if (!props.issueUrl || !selectedRepo.value || transferring.value) return

  const [targetOwner, targetRepo] = selectedRepo.value.split('/')
  if (!targetOwner || !targetRepo) return

  transferring.value = true
  try {
    await $fetch(`${props.issueUrl}/transfer`, {
      method: 'POST',
      body: { newOwner: targetOwner, newRepo: targetRepo }
    })

    open.value = false
    toast.add({ title: `Issue transferred to ${selectedRepo.value}`, icon: 'i-lucide-arrow-right-left' })
    emit('transferred')

    if (props.onClose) {
      props.onClose()
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to transfer issue', description: err.data?.message || err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    transferring.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <UCommandPalette
        v-model="selectedRepo"
        :groups="groups"
        value-key="value"
        placeholder="Search repositories..."
        close
        class="h-80"
        :ui="{ footer: 'px-2.5 py-2 flex justify-end' }"
        @update:open="open = $event"
      >
        <template #footer>
          <UButton
            label="Transfer"
            :loading="transferring"
            :disabled="!selectedRepo"
            @click="handleTransfer"
          />
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
