import { User } from '../../models/user.js'
import { logger } from '../../utils/logger.js'
import { redisCache } from '../../utils/redis.js'

export default async function handleAgentLoginFail(user: User) {
  try {
    await redisCache.del('bskySession:' + user.id)
    user.bskyAppPassword = null
    user.bskyAuthData = null
    user.bskyDid = null
    await user.save()
  } catch (error) {
    logger.error({
      message: `Error clearing bsky data for user ${user.url}`,
      error: error,
      stacktrace: (error as Error).stack
    })
  }
}
