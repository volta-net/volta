import { eq, and } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  // Get favorites joined with collaborator check to only return accessible ones
  const favorites = await db
    .select({
      id: schema.favoriteIssues.id,
      issueId: schema.favoriteIssues.issueId,
      issue: {
        id: schema.issues.id,
        pullRequest: schema.issues.pullRequest,
        number: schema.issues.number,
        title: schema.issues.title,
        state: schema.issues.state,
        stateReason: schema.issues.stateReason,
        draft: schema.issues.draft,
        merged: schema.issues.merged,
        htmlUrl: schema.issues.htmlUrl
      },
      repository: {
        id: schema.repositories.id,
        name: schema.repositories.name,
        fullName: schema.repositories.fullName
      },
      createdAt: schema.favoriteIssues.createdAt
    })
    .from(schema.favoriteIssues)
    .innerJoin(
      schema.issues,
      eq(schema.favoriteIssues.issueId, schema.issues.id)
    )
    .innerJoin(
      schema.repositories,
      eq(schema.issues.repositoryId, schema.repositories.id)
    )
    .innerJoin(
      schema.repositoryCollaborators,
      and(
        eq(schema.repositoryCollaborators.repositoryId, schema.repositories.id),
        eq(schema.repositoryCollaborators.userId, user!.id)
      )
    )
    .where(eq(schema.favoriteIssues.userId, user!.id))

  return favorites.map(f => ({
    id: f.id,
    issueId: f.issueId,
    issue: f.issue,
    repository: f.repository,
    createdAt: f.createdAt
  }))
})
