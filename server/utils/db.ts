import { db } from '@nuxthub/db'
import { withReplicas } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'

/**
 * Columns to exclude when selecting user data in public responses.
 * Use with Drizzle's column exclusion: `with: { user: { columns: PRIVATE_USER_COLUMNS } }`
 */
export const PRIVATE_USER_COLUMNS = {
  aiGatewayToken: false,
  aiModel: false
} as const

const dbReplicas = []
if (process.env.DATABASE_URL_REPLICA) {
  dbReplicas.push(drizzle(process.env.DATABASE_URL_REPLICA))
} else {
  dbReplicas.push(db)
}
export const dbs = withReplicas(db, dbReplicas as any)
