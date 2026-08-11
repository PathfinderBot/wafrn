import { Migration } from '../migrate.js'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS post_mentions_user_relations_user_id_created_at ON "postMentionsUserRelations" ("userId", "createdAt" DESC);`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS idx_posts_userid_privacy_createdat ON "posts" ("userId", privacy, "createdAt" DESC);`
  )
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS post_mentions_user_relations_user_id_created_at;`)
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_posts_userid_privacy_createdat;`)
}
