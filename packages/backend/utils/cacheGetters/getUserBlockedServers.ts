import { redisCache } from '../redis.js'
import { ServerBlock } from '../../models/index.js'
import { ServerBlockAttributes } from '../../models/serverBlock.js'

export default async function getUserBlockedServers(userId: string): Promise<ServerBlockAttributes[]> {
  const cacheResult = await redisCache.get('serverblocks:' + userId)
  if (cacheResult) {
    return JSON.parse(cacheResult)
  }
  try {
    const blocksServers = await ServerBlock.findAll({
      where: {
        userBlockerId: userId
      }
    })
    const result = blocksServers.map((elem: any) => elem.dataValues)
    redisCache.set('serverblocks:' + userId, JSON.stringify(result), 'EX', 600)
    return result
  } catch (error) {
    return []
  }
}
