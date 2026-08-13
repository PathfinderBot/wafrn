import { Migration } from '../migrate.js'
import { sequelize } from '../models/index.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  const updateQuery = await sequelize.query(`
       DROP TABLE IF EXISTS "postsancestors"
        `)
}
export const down: Migration = async (params) => {
  // LOL NO WAY BACK IN A QUICK WAY
}
