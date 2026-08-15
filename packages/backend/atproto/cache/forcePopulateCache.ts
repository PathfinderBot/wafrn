// we call this one if the dbs are empty. Create a file and script to force this to be done

import {
  ROOT_REPLIED_POSTS,
  LOCAL_USER_DIDS_CACHE_KEY,
  FOLLOWED_BSKY_DIDS_CACHE_KEY,
  FOLLOWED_HASHTAGS_CACHE_KEY
} from '../../constants.js'
import { sequelize } from '../../models/sequelize.js'
import { logger } from '../../utils/logger.js'
import { redisBloom, redisCache } from '../../utils/redis.js'

export async function forcePopulateCache() {
  // The reason to repeat code here: the db structure may change so the migration... yeahgh
  const queryInterface = sequelize.getQueryInterface()
  // lets get all dids that are followed and all the local dids
  const localUserDidsQuery = (
    await queryInterface.sequelize.query(
      `SELECT "bskyDid" FROM "users" WHERE "email" IS NOT NULL and "bskyDid" IS NOT NULL`
    )
  )[0].map((elem: any) => elem.bskyDid) as string[]
  logger.debug({
    message: 'Loaded cache: number of local users: ' + localUserDidsQuery.length
  })
  if (localUserDidsQuery.length) {
    await redisCache.sadd(LOCAL_USER_DIDS_CACHE_KEY, localUserDidsQuery)
  }
  const followedUsersDids: string[] = (
    await queryInterface.sequelize.query(
      `SELECT "bskyDid" FROM "users" WHERE "bskyDid" IS NOT NULL AND "id" IN (SELECT "followedId" FROM "follows" WHERE "followerId" IN (SELECT "id" FROM "users" WHERE "email" IS NOT NULL))`
    )
  )[0].map((elem: any) => elem.bskyDid)
  logger.debug({
    message: 'Loaded cache: number of followedUsersDids: ' + followedUsersDids.length
  })
  if (followedUsersDids.length) {
    await redisCache.sadd(FOLLOWED_BSKY_DIDS_CACHE_KEY, followedUsersDids)
  }
  const followedHashtags: string[] = (
    await queryInterface.sequelize.query(`SELECT DISTINCT "tagName" FROM "userFollowHashtags"`)
  )[0].map((elem: any) => elem.tagName.toLowerCase())
  logger.debug({
    message: 'Loaded cache: number of followed hashtags: ' + followedHashtags.length
  })
  if (followedHashtags.length) {
    await redisCache.sadd(FOLLOWED_HASHTAGS_CACHE_KEY, followedHashtags)
  }
  const repliedPosts: string[] = (
    await queryInterface.sequelize.query(
      `SELECT "bskyUri" FROM "posts" WHERE "id" IN (SELECT "rootId" FROM  "posts" where "userId" IN (select "id" FROM "users" WHERE "email" IS NOT NULL) AND "hierarchyLevel"!=1 AND "bskyUri" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 100000) and "hierarchyLevel" = 1 and "bskyUri" is NOT NULL;`
    )
  )[0].map((elem: any) => elem.bskyUri)
  logger.debug({
    message: 'Loaded cache: number of replied posts: ' + repliedPosts.length
  })
  for await (const uri of repliedPosts) {
    await redisBloom.add(ROOT_REPLIED_POSTS, uri)
  }
  // OH GOD OH GOD THIS WAS SO WRONG I USED GET DATE INSTEAD OF GET TIME
  await redisCache.set('bskyCacheDate', new Date().getTime())
  logger.debug(`atproto cache loaded`)
}
