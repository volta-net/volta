import { inArray, desc, eq, and } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Minimal label data returned by getLabelsForIssues
interface LabelData {
  id: number
  name: string
  color: string
  description: string | null
}

// Minimal type data returned by getTypesForIssues
interface TypeData {
  id: number
  name: string
  color: string | null
}

/**
 * Batch get labels for multiple issues (single query)
 */
export async function getLabelsForIssues(issueIds: number[]): Promise<Map<number, LabelData[]>> {
  if (issueIds.length === 0) return new Map<number, LabelData[]>()

  const labels = await db
    .select({
      issueId: schema.issueLabels.issueId,
      id: schema.labels.id,
      name: schema.labels.name,
      color: schema.labels.color,
      description: schema.labels.description
    })
    .from(schema.issueLabels)
    .innerJoin(schema.labels, eq(schema.issueLabels.labelId, schema.labels.id))
    .where(inArray(schema.issueLabels.issueId, issueIds))

  // Group by issue ID
  const labelsByIssue = new Map<number, LabelData[]>()
  for (const label of labels) {
    if (!labelsByIssue.has(label.issueId)) {
      labelsByIssue.set(label.issueId, [])
    }
    labelsByIssue.get(label.issueId)!.push({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description
    })
  }

  return labelsByIssue
}

/**
 * Batch get types for multiple issues (single query)
 */
export async function getTypesForIssues(typeIds: number[]): Promise<Map<number, TypeData>> {
  const uniqueIds = [...new Set(typeIds.filter(id => id !== null))] as number[]
  if (uniqueIds.length === 0) return new Map<number, TypeData>()

  const typesData = await db
    .select({
      id: schema.types.id,
      name: schema.types.name,
      color: schema.types.color
    })
    .from(schema.types)
    .where(inArray(schema.types.id, uniqueIds))

  return new Map(typesData.map(t => [t.id, t]))
}

/**
 * Batch get CI status for multiple PRs
 * Returns all check runs + commit statuses per headSha (filtered by repositoryId)
 * Includes GitHub Actions, Vercel Agent Review (Checks API) + Vercel deployments (Status API)
 */
export async function getCIStatusForPRs(prs: { repositoryId: number, headSha: string | null }[]): Promise<Map<string, CIStatus[]>> {
  const validPRs = prs.filter(pr => pr.headSha)
  if (validPRs.length === 0) return new Map<string, CIStatus[]>()

  // Build lookup key combining repositoryId and headSha for proper isolation
  const prLookup = new Map<string, { repositoryId: number, headSha: string }>()
  for (const pr of validPRs) {
    const key = `${pr.repositoryId}:${pr.headSha}`
    prLookup.set(key, { repositoryId: pr.repositoryId, headSha: pr.headSha! })
  }

  const headShas = validPRs.map(pr => pr.headSha!)
  const repositoryIds = [...new Set(validPRs.map(pr => pr.repositoryId))]

  // Fetch check runs (GitHub Actions, Vercel Agent Review, etc.) and commit statuses (Vercel deployments, etc.) in parallel
  // Filter by both repositoryId AND headSha to ensure we only get CI statuses for the correct PR
  const [checkRuns, commitStatuses] = await Promise.all([
    db
      .select({
        id: schema.checkRuns.id,
        status: schema.checkRuns.status,
        conclusion: schema.checkRuns.conclusion,
        htmlUrl: schema.checkRuns.htmlUrl,
        detailsUrl: schema.checkRuns.detailsUrl,
        name: schema.checkRuns.name,
        headSha: schema.checkRuns.headSha,
        repositoryId: schema.checkRuns.repositoryId,
        appSlug: schema.checkRuns.appSlug,
        createdAt: schema.checkRuns.createdAt
      })
      .from(schema.checkRuns)
      .where(and(
        inArray(schema.checkRuns.repositoryId, repositoryIds),
        inArray(schema.checkRuns.headSha, headShas)
      ))
      .orderBy(desc(schema.checkRuns.createdAt)),
    db
      .select({
        id: schema.commitStatuses.id,
        state: schema.commitStatuses.state,
        context: schema.commitStatuses.context,
        targetUrl: schema.commitStatuses.targetUrl,
        sha: schema.commitStatuses.sha,
        repositoryId: schema.commitStatuses.repositoryId,
        createdAt: schema.commitStatuses.createdAt
      })
      .from(schema.commitStatuses)
      .where(and(
        inArray(schema.commitStatuses.repositoryId, repositoryIds),
        inArray(schema.commitStatuses.sha, headShas)
      ))
      .orderBy(desc(schema.commitStatuses.createdAt))
  ])

  // Group runs by composite key (repositoryId:headSha), keeping only the latest run per check
  const runsByKey = new Map<string, CIStatus[]>()
  const seenChecks = new Map<string, Set<string>>() // key -> Set of check keys

  // Process check runs (Checks API)
  for (const check of checkRuns) {
    if (!check.headSha || !check.repositoryId) continue

    // Only include check runs that match a requested PR (repositoryId + headSha combination)
    const key = `${check.repositoryId}:${check.headSha}`
    if (!prLookup.has(key)) continue

    if (!runsByKey.has(key)) {
      runsByKey.set(key, [])
      seenChecks.set(key, new Set())
    }

    // Only keep the latest run per check (name + appSlug combination)
    const checkKey = `check:${check.name}:${check.appSlug || ''}`
    const seen = seenChecks.get(key)!
    if (!seen.has(checkKey)) {
      seen.add(checkKey)
      runsByKey.get(key)!.push({
        id: check.id,
        status: check.status,
        conclusion: check.conclusion,
        htmlUrl: check.detailsUrl || check.htmlUrl,
        name: check.name
      })
    }
  }

  // Process commit statuses (Status API - used by Vercel deployments, etc.)
  for (const status of commitStatuses) {
    if (!status.sha || !status.repositoryId) continue

    // Only include statuses that match a requested PR (repositoryId + headSha combination)
    const key = `${status.repositoryId}:${status.sha}`
    if (!prLookup.has(key)) continue

    if (!runsByKey.has(key)) {
      runsByKey.set(key, [])
      seenChecks.set(key, new Set())
    }

    // Only keep the latest status per context
    const statusKey = `status:${status.context}`
    const seen = seenChecks.get(key)!
    if (!seen.has(statusKey)) {
      seen.add(statusKey)

      // Convert Status API state to Checks API format
      // Status API: error, failure, pending, success
      // Checks API status: queued, in_progress, completed
      // Checks API conclusion: success, failure, neutral, cancelled, skipped, timed_out, action_required
      const isCompleted = status.state !== 'pending'
      let conclusion: string | null = null
      if (status.state === 'success') {
        conclusion = 'success'
      } else if (status.state === 'failure' || status.state === 'error') {
        conclusion = 'failure'
      }

      runsByKey.get(key)!.push({
        id: status.id,
        status: isCompleted ? 'completed' : 'in_progress',
        conclusion,
        htmlUrl: status.targetUrl,
        name: status.context
      })
    }
  }

  return runsByKey
}

/**
 * Batch get linked PRs for multiple issues (PRs that reference these issues)
 * Only returns open PRs
 */
export async function getLinkedPRsForIssues(issueIds: number[]): Promise<Map<number, LinkedPR[]>> {
  if (issueIds.length === 0) return new Map<number, LinkedPR[]>()

  const linkedPRs = await db
    .select({
      issueId: schema.issueLinkedPrs.issueId,
      id: schema.issues.id,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      htmlUrl: schema.issues.htmlUrl,
      headRef: schema.issues.headRef
    })
    .from(schema.issueLinkedPrs)
    .innerJoin(schema.issues, eq(schema.issueLinkedPrs.prId, schema.issues.id))
    .where(and(
      inArray(schema.issueLinkedPrs.issueId, issueIds),
      eq(schema.issues.state, 'open') // Only show open PRs
    ))

  // Group by issue ID
  const prsByIssue = new Map<number, LinkedPR[]>()
  for (const pr of linkedPRs) {
    if (!prsByIssue.has(pr.issueId)) {
      prsByIssue.set(pr.issueId, [])
    }
    prsByIssue.get(pr.issueId)!.push({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      htmlUrl: pr.htmlUrl,
      headRef: pr.headRef
    })
  }

  return prsByIssue
}

/**
 * Batch get linked issues for multiple PRs (issues that these PRs reference)
 */
export async function getLinkedIssuesForPRs(prIds: number[]): Promise<Map<number, LinkedIssue[]>> {
  if (prIds.length === 0) return new Map<number, LinkedIssue[]>()

  const linkedIssues = await db
    .select({
      prId: schema.issueLinkedPrs.prId,
      id: schema.issues.id,
      number: schema.issues.number,
      title: schema.issues.title,
      state: schema.issues.state,
      htmlUrl: schema.issues.htmlUrl
    })
    .from(schema.issueLinkedPrs)
    .innerJoin(schema.issues, eq(schema.issueLinkedPrs.issueId, schema.issues.id))
    .where(inArray(schema.issueLinkedPrs.prId, prIds))

  // Group by PR ID
  const issuesByPR = new Map<number, LinkedIssue[]>()
  for (const issue of linkedIssues) {
    if (!issuesByPR.has(issue.prId)) {
      issuesByPR.set(issue.prId, [])
    }
    issuesByPR.get(issue.prId)!.push({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.htmlUrl
    })
  }

  return issuesByPR
}

/**
 * Enrich issues/PRs with labels, types, and CI status (batch queries)
 */
export async function enrichIssuesWithMetadata<T extends { id: number, repository: { id: number }, headSha?: string | null, typeId?: number | null }>(
  items: T[],
  options: { includeLabels?: boolean, includeType?: boolean, includeCIStatus?: boolean } = {}
) {
  const { includeLabels = true, includeType = false, includeCIStatus = false } = options

  if (items.length === 0) return []

  // Batch fetch all metadata in parallel
  const [labelsByIssue, typesById, ciByHeadSha] = await Promise.all([
    includeLabels ? getLabelsForIssues(items.map(i => i.id)) : Promise.resolve(new Map()),
    includeType ? getTypesForIssues(items.map(i => (i as any).typeId).filter(Boolean)) : Promise.resolve(new Map()),
    includeCIStatus ? getCIStatusForPRs(items.map(i => ({ repositoryId: i.repository.id, headSha: (i as any).headSha }))) : Promise.resolve(new Map())
  ])

  // Merge metadata into items
  return items.map((item) => {
    const enriched: any = { ...item }

    if (includeLabels) {
      enriched.labels = labelsByIssue.get(item.id) || []
    }

    if (includeType && 'typeId' in item && item.typeId) {
      enriched.type = typesById.get(item.typeId) || null
    }

    if (includeCIStatus && 'headSha' in item && item.headSha) {
      enriched.ciStatuses = ciByHeadSha.get(`${item.repository.id}:${item.headSha}`) || []
    }

    return enriched
  })
}
