import highlight from '@comark/vue/plugins/highlight'
import diff from '@shikijs/langs/diff'

export default defineMarkdownComponent({
  name: 'IssueComark',
  plugins: [
    highlight({
      languages: [diff]
    })
  ]
})
