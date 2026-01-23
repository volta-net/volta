/**
 * Columns to exclude when selecting user data in public responses.
 * Use with Drizzle's column exclusion: `with: { user: { columns: PRIVATE_USER_COLUMNS } }`
 */
export const PRIVATE_USER_COLUMNS = {
  aiGatewayToken: false,
  aiModel: false
} as const
