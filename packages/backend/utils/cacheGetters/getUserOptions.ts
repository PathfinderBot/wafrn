import { UserOptions } from '../../models/index.js'
import { redisCache } from '../redis.js'

async function getUserOptions(userId: string): Promise<Array<{ optionName: string; optionValue: string }>> {
  const cacheReply = undefined // await redisCache.get('userOptions:' + userId)
  if (cacheReply) {
    return JSON.parse(cacheReply)
  } else {
    const dbReply = await UserOptions.findAll({
      where: {
        userId: userId
      }
    })
    return getUserOptions(userId)
  }
}

export { getUserOptions }
