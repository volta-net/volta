<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { user, clear } = useUserSession()
const colorMode = useColorMode()

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: user.value?.username,
  avatar: user.value?.avatar ? { src: user.value.avatar } : undefined
}], [{
  label: 'Feedback',
  icon: 'i-lucide-message-circle',
  to: 'https://github.com/volta-net/volta',
  target: '_blank'
}], [{
  label: 'Appearance',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'System',
    icon: 'i-lucide-monitor',
    type: 'checkbox',
    checked: colorMode.preference === 'system',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'system'
    }
  }, {
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.preference === 'light',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'light'
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.preference === 'dark',
    onUpdateChecked(checked: boolean) {
      if (checked) {
        colorMode.preference = 'dark'
      }
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }]
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  onSelect() {
    clear()
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', collisionPadding: 12 }"
    size="md"
  >
    <UButton
      :avatar="{
        src: user?.avatar,
        alt: user?.username
      }"
      :label="user?.username"
      variant="ghost"
      size="md"
      class="data-[state=open]:bg-elevated px-2.5 lg:px-1.5"
      :ui="{ label: 'lg:hidden' }"
    />
  </UDropdownMenu>
</template>
