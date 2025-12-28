<script setup lang="ts">
import type { IssueDetail } from '#shared/types/issue'
import type { MentionUser } from '~/composables/useEditorMentions'

interface IssueReference {
  id: number
  number: number
  title: string
  state: string
  pullRequest: boolean
}

const props = defineProps<{
  issue: IssueDetail
  collaborators?: MentionUser[]
  repositoryIssues?: IssueReference[]
}>()

defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

const body = ref(props.issue.body || '')
const isSaving = ref(false)
const isParsing = ref(false)

watch(() => props.issue.body, (newBody) => {
  if (!isParsing.value) {
    body.value = newBody || ''
  }
})

async function saveBody() {
  if (isSaving.value || isParsing.value) return

  isSaving.value = true

  try {
    const [owner, name] = props.issue.repository.fullName.split('/')
    await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/body`, {
      method: 'PATCH',
      body: { body: body.value }
    })
    toast.add({ title: 'Description updated', icon: 'i-lucide-check' })
  } catch (err: any) {
    toast.add({ title: 'Failed to update description', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    isSaving.value = false
  }
}

const debouncedSaveBody = useDebounceFn(saveBody, 2000)

watch(body, () => {
  if (!isParsing.value) {
    debouncedSaveBody()
  }
})
</script>

<template>
  <IssueEditor
    v-model="body"
    :issue="issue"
    :collaborators="collaborators"
    :repository-issues="repositoryIssues"
    :completion="true"
    :parse-mentions="true"
    placeholder="Add a description..."
    :ui="{
      content: 'flex flex-col',
      base: 'sm:px-0 pb-12 flex-1'
    }"
    class="flex-1"
    @parsing="isParsing = $event"
  />
</template>
