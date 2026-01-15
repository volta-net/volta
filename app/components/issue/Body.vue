<script setup lang="ts">
import type { MentionUser } from '~/composables/useEditorMentions'

const props = defineProps<{
  issue: IssueDetail
  collaborators?: MentionUser[]
}>()

defineEmits<{
  (e: 'refresh'): void
}>()

const toast = useToast()

const body = ref(props.issue.body || '')
const isSaving = ref(false)
const isParsing = ref(false)

// Track the original body for comparison
const originalBody = ref(props.issue.body || '')

watch(() => props.issue.body, (newBody) => {
  if (!isParsing.value) {
    body.value = newBody || ''
    originalBody.value = newBody || ''
  }
})

// Normalize content for comparison
// Normalize whitespace and common markdown transformations
function normalizeForComparison(content: string): string {
  let normalized = content

  // Normalize table separators (editor may add/remove padding)
  normalized = normalized.replace(/\|[\s-:]+\|/g, (match: string) => match.replace(/\s+/g, ''))

  // Normalize multiple newlines to single
  normalized = normalized.replace(/\n{3,}/g, '\n\n')

  // Normalize trailing whitespace on lines
  normalized = normalized.replace(/[ \t]+$/gm, '')

  // Normalize details blocks (may have whitespace differences)
  normalized = normalized.replace(/<details[^>]*>/gi, '<details>')
  normalized = normalized.replace(/<summary[^>]*>/gi, '<summary>')

  return normalized.trim()
}

async function saveBody() {
  if (isSaving.value || isParsing.value) return

  // Only save if actual content changed
  if (normalizeForComparison(body.value) === normalizeForComparison(originalBody.value)) {
    return
  }

  isSaving.value = true

  try {
    const [owner, name] = props.issue.repository.fullName.split('/')
    await $fetch(`/api/repositories/${owner}/${name}/issues/${props.issue.number}/body`, {
      method: 'PATCH',
      body: { body: body.value }
    })
    toast.add({ title: 'Description updated', icon: 'i-lucide-check' })
    // Update original after successful save
    originalBody.value = body.value
  } catch (err: any) {
    toast.add({ title: 'Failed to update description', description: err.message, color: 'error', icon: 'i-lucide-x' })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <IssueEditor
    v-model="body"
    :issue="issue"
    :collaborators="collaborators"
    placeholder="Add a description..."
    @parsing="isParsing = $event"
    @blur="saveBody"
  />
</template>
