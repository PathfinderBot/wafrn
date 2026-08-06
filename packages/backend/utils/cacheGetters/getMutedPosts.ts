import { Op, QueryTypes } from 'sequelize'
import { sequelize, SilencedPost } from '../../models/index.js'
import { redisCache } from '../redis.js'
import { logger } from '../logger.js'

/**
 * Get all posts that are muted (or descendants of muted posts if superMute)
 */
async function getMutedPosts(userId: string, superMute = false): Promise<Array<string>> {
  let res: string[] = []
  const cacheResult = await redisCache.get((superMute ? 'superMutedPosts:' : 'mutedPosts:') + userId)

  if (cacheResult) {
    res = JSON.parse(cacheResult)
  } else {
    const mutedPostsQuery = await SilencedPost.findAll({
      where: {
        userId: userId,
        superMuted: superMute
          ? true
          : {
            [Op.in]: [true, false, null, undefined] as any
          }
      },
      attributes: ['postId']
    })

    res = mutedPostsQuery.map((elem: any) => elem.postId)

    // If superMute, also get all descendants of muted posts
    if (superMute && res.length) {
      const mutedPosts = await sequelize.query(
        `
        WITH RECURSIVE descendants AS (
          SELECT id FROM posts WHERE id = ANY(ARRAY[:mutedIds]::uuid[])
          UNION ALL
          SELECT p.id FROM posts p
          INNER JOIN descendants d ON p."parentId" = d.id
        )
        SELECT id FROM descendants
        `,
        {
          replacements: { mutedIds: res },
          type: QueryTypes.SELECT
        }
      ) as Array<{ id: string }>

      res = mutedPosts.map((elem) => elem.id)
    }

    await redisCache.set(
      (superMute ? 'superMutedPosts:' : 'mutedPosts:') + userId,
      JSON.stringify(res),
      'EX',
      600
    )
  }

  return res
}

/**
 * Get muted posts for multiple users (batch operation)
 */
async function getMutedPostsMultiple(userIds: string[], superMute = false) {
  let cacheResults: (string | null)[] = []

  try {
    cacheResults = await redisCache.mget(
      userIds.map((userId) => (superMute ? 'superMutedPosts:' : 'mutedPosts:') + userId)
    )
  } catch (error) {
    logger.error({
      message: `Error getMutedPostsMultiple`,
      userIds,
      superMute,
      error
    })
  }

  // If all cached, return immediately
  if (cacheResults.every((result) => !!result)) {
    const ids = cacheResults.map((result) => JSON.parse(result!) as string[])
    return new Map(userIds.map((userId, index) => [userId, ids[index]]))
  }

  // Build query for non-cached users
  const where = {
    userId: {
      [Op.in]: userIds
    }
  } as { userId: Record<any, any>; superMuted?: true }

  if (superMute) {
    where.superMuted = true
  }

  const mutedFirstIds = await SilencedPost.findAll({
    where,
    attributes: ['postId', 'userId']
  })

  const postIds = new Map<string, string[]>()

  for (const result of cacheResults) {
    const index = cacheResults.indexOf(result)
    const userId = userIds[index]

    if (result) {
      // Use cached result
      postIds.set(userId, JSON.parse(result) as string[])
    } else {
      // Get muted posts for this user
      let mutedIds = mutedFirstIds
        .filter((elem) => elem.userId === userId)
        .map((elem) => elem.postId)

      // If superMute, also get all descendants
      if (superMute && mutedIds.length) {
        const mutedPosts = await sequelize.query(
          `
          WITH RECURSIVE descendants AS (
            SELECT id FROM posts WHERE id = ANY(ARRAY[:mutedIds]::uuid[])
            UNION ALL
            SELECT p.id FROM posts p
            INNER JOIN descendants d ON p."parentId" = d.id
          )
          SELECT id FROM descendants
          `,
          {
            replacements: { mutedIds: mutedIds },
            type: QueryTypes.SELECT
          }
        ) as Array<{ id: string }>

        mutedIds = mutedPosts.map((elem) => elem.id)
      }

      // Cache the result
      await redisCache.set(
        (superMute ? 'superMutedPosts:' : 'mutedPosts:') + userId,
        JSON.stringify(mutedIds),
        'EX',
        600
      )

      postIds.set(userId, mutedIds)
    }
  }

  return postIds
}

export { getMutedPosts, getMutedPostsMultiple }