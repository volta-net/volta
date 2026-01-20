/**
 * Composable for managing repository sync operations with polling.
 * Handles single and bulk sync operations with a shared polling loop.
 */
export function useRepositorySync() {
  const toast = useToast()

  const { data: installations, status: installationsStatus, refresh } = useLazyFetch<Installation[]>('/api/installations')

  // Refresh data when window gains focus and check poll queue
  const focused = useWindowFocus()
  watch(focused, async (isFocused) => {
    if (isFocused) {
      await refresh()
      // Immediately check poll queue after focus refresh
      checkPollQueue()
    }
  })

  // Track locally initiated syncs (for immediate UI feedback)
  const localSyncing = ref<Set<string>>(new Set())
  // Track repos being polled (fullName -> showToast)
  const pollQueue = ref<Map<string, boolean>>(new Map())
  // Single flag to track if polling loop is running
  const isPollingActive = ref(false)

  // Find a repository by fullName
  function findRepo(fullName: string) {
    return installations.value
      ?.flatMap(inst => inst.repositories)
      .find(r => r.fullName === fullName)
  }

  // Combined syncing state: server-side OR locally initiated OR being polled
  function isSyncing(fullName: string) {
    if (localSyncing.value.has(fullName)) return true
    if (pollQueue.value.has(fullName)) return true
    return findRepo(fullName)?.syncing ?? false
  }

  // Check if repo is being polled
  function isBeingPolled(fullName: string) {
    return pollQueue.value.has(fullName)
  }

  // Auto-poll for server-side syncing repos (handles page refresh case)
  const serverSyncingRepos = computed(() =>
    installations.value
      ?.flatMap(inst => inst.repositories)
      .filter(r => r.syncing)
      .map(r => r.fullName) ?? []
  )

  watch(serverSyncingRepos, (repos) => {
    for (const fullName of repos) {
      if (!pollQueue.value.has(fullName)) {
        localSyncing.value.add(fullName)
        addToPollQueue(fullName, true)
      }
    }
  }, { immediate: true })

  /**
   * Add a repository to the polling queue.
   * Starts the shared polling loop if not already running.
   */
  function addToPollQueue(fullName: string, showToast = true) {
    if (pollQueue.value.has(fullName)) return
    pollQueue.value.set(fullName, showToast)

    if (!isPollingActive.value) {
      runPollingLoop()
    }
  }

  /**
   * Check all repos in poll queue and remove completed ones.
   * Called after each refresh.
   */
  function checkPollQueue() {
    for (const [fullName, showToast] of [...pollQueue.value]) {
      const repo = findRepo(fullName)
      if (repo && !repo.syncing) {
        localSyncing.value.delete(fullName)
        pollQueue.value.delete(fullName)

        if (showToast) {
          const [, name] = fullName.split('/')
          toast.add({
            title: `Repo ${name} synced`,
            description: 'Repository sync completed successfully',
            color: 'success'
          })
        }
      }
    }
  }

  /**
   * Single shared polling loop.
   * Makes one refresh call per interval regardless of how many repos are syncing.
   * Only polls when window is focused to avoid rate limiting.
   */
  async function runPollingLoop() {
    if (isPollingActive.value) return
    isPollingActive.value = true

    const maxAttempts = 180 // 180 * 15s = 45 minutes max
    const pollInterval = 15000 // 15 seconds to avoid rate limiting

    try {
      for (let i = 0; i < maxAttempts && pollQueue.value.size > 0; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))

        // Only refresh when window is focused to avoid rate limiting
        if (!focused.value) continue

        await refresh()
        checkPollQueue()
      }

      // Handle timeout for remaining repos
      for (const [fullName, showToast] of pollQueue.value) {
        localSyncing.value.delete(fullName)
        if (showToast) {
          toast.add({
            title: 'Sync in progress',
            description: 'The sync is taking longer than expected. It will complete in the background.',
            color: 'warning'
          })
        }
      }
      pollQueue.value.clear()
    } finally {
      isPollingActive.value = false
    }
  }

  /**
   * Sync a single repository.
   */
  async function syncRepository(fullName: string) {
    const [owner, name] = fullName.split('/')

    if (pollQueue.value.has(fullName)) return

    localSyncing.value.add(fullName)

    try {
      await $fetch(`/api/repositories/${owner}/${name}/sync`, { method: 'POST' })
      // Refresh to pick up syncing=true state (now set synchronously by server)
      await refresh()
      // Start polling for completion
      addToPollQueue(fullName, true)
    } catch (error: any) {
      localSyncing.value.delete(fullName)
      toast.add({
        title: 'Sync failed',
        description: error.data?.message || 'An error occurred',
        color: 'error'
      })
    }
  }

  /**
   * Sync multiple repositories (bulk operation).
   * Uses the shared polling loop - just waits for all repos to finish.
   * Returns true if all completed, false if timeout.
   */
  async function syncMultiple(repoFullNames: string[], showToasts = false): Promise<boolean> {
    // Add all to the shared poll queue
    repoFullNames.forEach((name) => {
      if (!pollQueue.value.has(name)) {
        pollQueue.value.set(name, showToasts)
      }
    })

    // Ensure the shared polling loop is running
    if (!isPollingActive.value) {
      runPollingLoop()
    }

    // Wait for all repos to be removed from queue (by the shared loop)
    const maxWaitMs = 45 * 60 * 1000 // 45 minutes (matches polling loop timeout)
    const checkInterval = 1000
    const start = Date.now()

    while (Date.now() - start < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, checkInterval))

      // Check if all our repos are done (removed from queue by the loop)
      if (repoFullNames.every(name => !pollQueue.value.has(name))) {
        return true
      }
    }

    // Timeout - clean up any remaining
    repoFullNames.forEach((name) => {
      localSyncing.value.delete(name)
      pollQueue.value.delete(name)
    })
    return false
  }

  return {
    // Data
    installations,
    installationsStatus,
    refresh,

    // State checks
    isSyncing,
    isBeingPolled,

    // Actions
    syncRepository,
    syncMultiple
  }
}
