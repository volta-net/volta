import { get, set } from 'idb-keyval'

export default defineRstorePlugin({
  name: 'indexedDB',
  category: 'local',
  async setup({ hook }) {
    const cache = await get('rstore-cache')
    hook('init', ({ store }) => {
      cache && store.$cache.setState(cache.rstore)
    })
    hook('afterCacheWrite', async ({ store }) => {
      console.log('afterCacheWrite rstore indexeddb plugin')
      const cache = { rstore: store.$cache.getState(), lastWrite: new Date() }
      set('rstore-cache', cache)
    })
    // Todo: store last fetch for notifications collection to use ?since=
  },
})
