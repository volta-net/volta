import highlight from '@comark/nuxt/plugins/highlight'
import diff from '@shikijs/langs/diff'

export default defineComarkComponent({
  name: 'IssueComark',
  plugins: [
    highlight({
      languages: [diff]
    })
  ]
})
