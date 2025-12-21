import { inArray, desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'
import type { CIStatus, Label, Type } from '#shared/types/issue'

/**
 * Batch get labels for multiple issues (single query)
 */
export async function getLabelsForIssues(issueIds: number[]): Promise<Map<number, Label[]>> {
  if (issueIds.length === 0) return new Map<number, Label[]>()

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
  const labelsByIssue = new Map<number, Label[]>()
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
export async function getTypesForIssues(typeIds: number[]): Promise<Map<number, Type>> {
  const uniqueIds = [...new Set(typeIds.filter(id => id !== null))] as number[]
  if (uniqueIds.length === 0) return new Map<number, Type>()

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
 * Batch get CI status for multiple PRs (single query)
 */
export async function getCIStatusForPRs(prs: { repositoryId: number, headSha: string | null }[]): Promise<Map<string, CIStatus>> {
  const validPRs = prs.filter(pr => pr.headSha)
  if (validPRs.length === 0) return new Map<string, CIStatus>()

  const headShas = validPRs.map(pr => pr.headSha!)

  const runs = await db
    .select({
      id: schema.workflowRuns.id,
      status: schema.workflowRuns.status,
      conclusion: schema.workflowRuns.conclusion,
      htmlUrl: schema.workflowRuns.htmlUrl,
      name: schema.workflowRuns.name,
      headSha: schema.workflowRuns.headSha,
      createdAt: schema.workflowRuns.createdAt
    })
    .from(schema.workflowRuns)
    .where(inArray(schema.workflowRuns.headSha, headShas))
    .orderBy(desc(schema.workflowRuns.createdAt))

  // Keep only the latest run per headSha
  const ciByHeadSha = new Map<string, CIStatus>()
  for (const run of runs) {
    if (run.headSha && !ciByHeadSha.has(run.headSha)) {
      ciByHeadSha.set(run.headSha, {
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.htmlUrl,
        name: run.name
      })
    }
  }

  return ciByHeadSha
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
      enriched.ciStatus = ciByHeadSha.get(item.headSha) || null
    }

    return enriched
  })
}
