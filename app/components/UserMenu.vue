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
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :avatar="{
        src: user?.avatar,
        alt: user?.username
      }"
      color="neutral"
      variant="ghost"
      block
      square
      class="data-[state=open]:bg-elevated"
    />
  </UDropdownMenu>
</template>
