import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(
    `CREATE INDEX IF NOT EXISTS users_federatedHostId ON "users" ("federatedHostId");
CREATE INDEX IF NOT EXISTS follows_follower_id_accepted ON "follows" ("followerId", "accepted");
CREATE INDEX IF NOT EXISTS serverBlocks_blockedServerId ON "serverBlocks" ("blockedServerId");
CREATE INDEX IF NOT EXISTS silencedPosts_userId ON "silencedPosts" ("userId");
CREATE INDEX IF NOT EXISTS silencedPosts_postId ON "silencedPosts" ("postId");
CREATE INDEX IF NOT EXISTS postReports_postId ON "postReports" ("postId");
CREATE INDEX IF NOT EXISTS inviteCodes_createdByUserId ON "inviteCodes" ("createdByUserId");
CREATE INDEX IF NOT EXISTS questionPollAnswers_questionPollQuestionId ON "questionPollAnswers" ("questionPollQuestionId");
CREATE INDEX IF NOT EXISTS questionPollAnswers_userId ON "questionPollAnswers" ("userId");
CREATE INDEX IF NOT EXISTS notifications_user_detached_date ON "notifications" ("notifiedUserId", "detached", "createdAt" DESC);`
  )
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX bites_biter;`)
  await queryInterface.sequelize.query(`DROP INDEX bites_bited;`)
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_biter`)
  await queryInterface.sequelize.query(`DROP INDEX userBitesPostRelations_post`)
}
