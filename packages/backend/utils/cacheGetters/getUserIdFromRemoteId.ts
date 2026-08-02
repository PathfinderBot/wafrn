import { User } from '../../models/index.js'
import { isLocalRemoteId, getLocalUsernameFromLocalRemoteId } from '../../models/user.js'
import { redisCache } from '../redis.js'

async function getUserIdFromRemoteId(remoteId: string): Promise<string> {
  let res = ''
  const cacheResult = await redisCache.get('userRemoteId:' + remoteId.toLocaleLowerCase())
  if (cacheResult) {
    res = cacheResult
  } else {
    const user = isLocalRemoteId(remoteId)
      ? await User.findOne({
          attributes: ['id'],
          where: {
            url: getLocalUsernameFromLocalRemoteId(remoteId)
          }
        })
      : await User.findOne({
          attributes: ['id'],
          where: {
            remoteId: remoteId
          }
        })
    if (user) {
      res = user.id
      await redisCache.set('userRemoteId:' + remoteId.toLocaleLowerCase(), res, 'EX', 1000)
    }
  }
  return res
}

export { getUserIdFromRemoteId }
