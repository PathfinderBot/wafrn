import { Migration } from '../migrate.js'
import { sequelize } from '../models/index.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  const updateQuery = await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_posts_rootid_active
ON posts ("rootId")
WHERE "isDeleted" = false
        `)
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await sequelize.query(`DROP INDEX IF EXISTS idx_posts_rootid_active`)
}
