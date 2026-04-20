import { DataTypes, Sequelize, UUIDV4 } from "sequelize";
import { Migration } from "../migrate.js";
import { FederatedHost } from "../models/federatedHost.js";
import { User } from "../models/user.js";
import { DataType } from "sequelize-typescript";
import { redisBloom, redisCache } from "../utils/redis.js";
import { FOLLOWED_BSKY_DIDS_CACHE_KEY, FOLLOWED_HASHTAGS_CACHE_KEY, LOCAL_USER_DIDS_CACHE_KEY, ROOT_REPLIED_POSTS } from "../constants.js";

export const up: Migration = async (params) => {
  const queryInterface = params.context;
  // lets get all dids that are followed and all the local dids
  const localUserDidsQuery = (await queryInterface.sequelize.query(`SELECT "bskyDid" FROM "users" WHERE "email" IS NOT NULL and "bskyDid" IS NOT NULL`))[0].map((elem: any) => elem.bskyDid) as string[]
  await redisCache.sadd(LOCAL_USER_DIDS_CACHE_KEY,localUserDidsQuery)
  const followedUsersDids: string[] = (await queryInterface.sequelize.query(`SELECT "bskyDid" FROM "users" WHERE "bskyDid" IS NOT NULL AND "id" IN (SELECT "followedId" FROM "follows" WHERE "followerId" IN (SELECT "id" FROM "users" WHERE "email" IS NOT NULL))`))[0].map((elem: any) => elem.bskyDid )
  await redisCache.sadd(FOLLOWED_BSKY_DIDS_CACHE_KEY, followedUsersDids)
  const followedHashtags: string[] = (await queryInterface.sequelize.query(`SELECT DISTINCT "tagName" FROM "userFollowHashtags"`))[0].map((elem: any) => elem.tagName.toLowerCase())
  await redisCache.sadd(FOLLOWED_HASHTAGS_CACHE_KEY, followedHashtags)
  const repliedPosts: string[] = (await queryInterface.sequelize.query(`SELECT "bskyUri" FROM "posts" WHERE "id" IN (SELECT "ancestorId" FROM "postsancestors" WHERE "postsId" IN (SELECT "id" FROM  "posts" where "userId" IN (select "id" FROM "users" WHERE "email" IS NOT NULL) AND "hierarchyLevel"!=1 AND "bskyUri" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 10000)) and "hierarchyLevel" = 1 and "bskyUri" is NOT NULL`))[0].map((elem: any) => elem.bskyUri )
  for await (const uri of repliedPosts) {
    await redisBloom.add(ROOT_REPLIED_POSTS, uri )
  }
};


export const down: Migration = async (params) => {
    
};
