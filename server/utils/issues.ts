import { inArray, desc, eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

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
 * Returns all check runs + commit statuses per headSha
 * Includes GitHub Actions, Vercel Agent Review (Checks API) + Vercel deployments (Status API)
 */
export async function getCIStatusForPRs(prs: { repositoryId: number, headSha: string | null }[]): Promise<Map<string, CIStatus[]>> {
  const validPRs = prs.filter(pr => pr.headSha)
  if (validPRs.length === 0) return new Map<string, CIStatus[]>()

  const headShas = validPRs.map(pr => pr.headSha!)

  // Fetch check runs (GitHub Actions, Vercel Agent Review, etc.) and commit statuses (Vercel deployments, etc.) in parallel
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
        appSlug: schema.checkRuns.appSlug,
        createdAt: schema.checkRuns.createdAt
      })
      .from(schema.checkRuns)
      .where(inArray(schema.checkRuns.headSha, headShas))
      .orderBy(desc(schema.checkRuns.createdAt)),
    db
      .select({
        id: schema.commitStatuses.id,
        state: schema.commitStatuses.state,
        context: schema.commitStatuses.context,
        targetUrl: schema.commitStatuses.targetUrl,
        sha: schema.commitStatuses.sha,
        createdAt: schema.commitStatuses.createdAt
      })
      .from(schema.commitStatuses)
      .where(inArray(schema.commitStatuses.sha, headShas))
      .orderBy(desc(schema.commitStatuses.createdAt))
  ])

  // Group runs by headSha, keeping only the latest run per check
  const runsByHeadSha = new Map<string, CIStatus[]>()
  const seenChecks = new Map<string, Set<string>>() // headSha -> Set of check keys

  // Process check runs (Checks API)
  for (const check of checkRuns) {
    if (!check.headSha) continue

    if (!runsByHeadSha.has(check.headSha)) {
      runsByHeadSha.set(check.headSha, [])
      seenChecks.set(check.headSha, new Set())
    }

    // Only keep the latest run per check (name + appSlug combination)
    const checkKey = `check:${check.name}:${check.appSlug || ''}`
    const seen = seenChecks.get(check.headSha)!
    if (!seen.has(checkKey)) {
      seen.add(checkKey)
      runsByHeadSha.get(check.headSha)!.push({
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
    if (!status.sha) continue

    if (!runsByHeadSha.has(status.sha)) {
      runsByHeadSha.set(status.sha, [])
      seenChecks.set(status.sha, new Set())
    }

    // Only keep the latest status per context
    const statusKey = `status:${status.context}`
    const seen = seenChecks.get(status.sha)!
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

      runsByHeadSha.get(status.sha)!.push({
        id: status.id,
        status: isCompleted ? 'completed' : 'in_progress',
        conclusion,
        htmlUrl: status.targetUrl,
        name: status.context
      })
    }
  }

  return runsByHeadSha
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
      htmlUrl: schema.issues.htmlUrl
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
      htmlUrl: pr.htmlUrl
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
      enriched.ciStatuses = ciByHeadSha.get(item.headSha) || []
    }

    return enriched
  })
}
