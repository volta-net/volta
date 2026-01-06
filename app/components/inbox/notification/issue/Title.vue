<script setup lang="ts">
import type { IssueDetail } from '#shared/types/issue'

const props = defineProps<{
  issue: IssueDetail
}>()

const emit = defineEmits<{
  (e: 'update:title', title: string): void
}>()

const toast = useToast()

const editedTitle = ref(props.issue.title)
const isSaving = ref(false)

watch(() => props.issue.title, (newTitle) => {
  editedTitle.value = newTitle
})

async function saveTitle() {
  if (editedTitle.value === props.issue.title) {
    return
  }

  isSaving.value = true
  try {
    const [owner, name] = props.issue.repository.fullName.split('/')
    await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/title`, {
      method: 'PATCH',
      body: { title: editedTitle.value }
    })
    emit('update:title', editedTitle.value)
    toast.add({ title: 'Title updated', icon: 'i-lucide-check' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update title', description: err.message, color: 'error', icon: 'i-lucide-x' })
    editedTitle.value = props.issue.title
  } finally {
    isSaving.value = false
  }
}

const debouncedSaveTitle = useDebounceFn(saveTitle, 2000)

watch(editedTitle, () => {
  debouncedSaveTitle()
})
</script>

<template>
  <UInput
    v-model="editedTitle"
    :loading="isSaving"
    trailing
    variant="none"
    :ui="{ base: 'p-0 text-xl font-semibold' }"
  />
</template>
