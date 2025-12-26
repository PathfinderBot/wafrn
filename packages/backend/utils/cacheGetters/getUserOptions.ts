import { UserOptions } from '../../models/index.js'
import { redisCache } from '../redis.js'

async function getUserOptions(userId: string, forceTryCache?: boolean): Promise<Array<{ optionName: string; optionValue: string }>> {
  const cacheReply = forceTryCache ? (await redisCache.get('userOptions:' + userId)) : undefined
  if (cacheReply) {
    return JSON.parse(cacheReply)
  } else {
    const dbReply = await UserOptions.findAll({
      where: {
        userId: userId
      }
    })
    redisCache.set('userOptions:' + userId, JSON.stringify(dbReply.map((elem: any) => elem.dataValues)), 'EX', 600)
    return getUserOptions(userId, true)
  }
}

export { getUserOptions }
