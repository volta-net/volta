import highlight from '@comark/nuxt/plugins/highlight'
import ChatIssue from './ChatIssue.vue'

export default defineMarkdownComponent({
  name: 'ChatComark',
  plugins: [
    highlight()
  ],
  components: {
    issue: ChatIssue
  },
  class: '*:first:mt-0 *:last:mb-0 text-sm'
})
