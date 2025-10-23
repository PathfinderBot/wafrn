import { DataTypes, Sequelize, UUIDV4 } from 'sequelize'
import { Migration } from '../migrate.js'
import { FederatedHost } from '../models/federatedHost.js'
import { User } from '../models/user.js'
import { DataType } from 'sequelize-typescript'

export const up: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(
    `CREATE INDEX userLikesPosts_userid ON public."userLikesPostRelations" ("userId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX userFollowHashtag_userId ON public."userFollowHashtags" ("userId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX userEmojiRelations_userId ON public."userEmojiRelations" ("userId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX userBookmarkedPosts_userId ON public."userBookmarkedPosts" ("userId");`
  )
  await queryInterface.sequelize.query(`CREATE INDEX unifiedPushData_userId ON public."unifiedPushData" ("userId");`)
  await queryInterface.sequelize.query(`CREATE INDEX serverBlocks_userId ON public."serverBlocks" ("userBlockerId");`)
  await queryInterface.sequelize.query(
    `CREATE INDEX remoteUserPostViews_userId ON public."remoteUserPostViews" ("userId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX remoteUserPostViews_postId ON public."remoteUserPostViews" ("postId");`
  )
  await queryInterface.sequelize.query(
    `CREATE INDEX questionPollQuestions_pollId ON public."questionPollQuestions" ("questionPollId");`
  )

  await queryInterface.sequelize.query(`CREATE INDEX postReports_userId ON public."postReports" ("userId");`)
  await queryInterface.sequelize.query(`CREATE INDEX postHostViews_postId ON public."postHostViews" ("postId");`)
  await queryInterface.sequelize.query(
    `CREATE INDEX postEmojiRelations_postId ON public."postEmojiRelations" ("postId");`
  )
  await queryInterface.sequelize.query(`CREATE INDEX mutes_muterId ON public."mutes" ("muterId");`)
  await queryInterface.sequelize.query(`CREATE INDEX mutes_mutedId ON public."mutes" ("mutedId");`)
  await queryInterface.sequelize.query(`CREATE INDEX emojiReactions_userId ON public."emojiReactions" ("userId");`)
  await queryInterface.sequelize.query(`CREATE INDEX emojiReactions_postid ON public."emojiReactions" ("postId");`)
  await queryInterface.sequelize.query(`CREATE INDEX asks_userAsker ON public."asks" ("userAsker");`)
  await queryInterface.sequelize.query(`CREATE INDEX asks_userAsked ON public."asks" ("userAsked");`)
}
export const down: Migration = async (params) => {
  const queryInterface = params.context
  await queryInterface.sequelize.query(`DROP INDEX userLikesPosts_userid`)
  await queryInterface.sequelize.query(`DROP INDEX userFollowHashtag_userId`)
  await queryInterface.sequelize.query(`DROP INDEX userEmojiRelations_userId`)
  await queryInterface.sequelize.query(`DROP INDEX userBookmarkedPosts_userId`)
  await queryInterface.sequelize.query(`DROP INDEX unifiedPushData_userId`)
  await queryInterface.sequelize.query(`DROP INDEX serverBlocks_userId`)
  await queryInterface.sequelize.query(`DROP INDEX remoteUserPostViews_userId`)

  await queryInterface.sequelize.query(`DROP INDEX remoteUserPostViews_postId`)

  await queryInterface.sequelize.query(`DROP INDEX questionPollQuestions_pollId`)
  await queryInterface.sequelize.query(`DROP INDEX questionPollId_userId`)
  await queryInterface.sequelize.query(`DROP INDEX questionPollId_questionPollQuestionId`)
  await queryInterface.sequelize.query(`DROP INDEX postReports_userId`)
  await queryInterface.sequelize.query(`DROP INDEX postHostViews_postId`)
  await queryInterface.sequelize.query(`DROP INDEX postEmojiRelations_postId`)
  await queryInterface.sequelize.query(`DROP INDEX mutes_muterId`)
  await queryInterface.sequelize.query(`DROP INDEX mutes_mutedId`)
  await queryInterface.sequelize.query(`DROP INDEX emojiReactions_userId`)
  await queryInterface.sequelize.query(`DROP INDEX emojiReactions_postid`)
  await queryInterface.sequelize.query(`DROP INDEX asks_userAsker`)
  await queryInterface.sequelize.query(`DROP INDEX asks_userAsked`)
}
