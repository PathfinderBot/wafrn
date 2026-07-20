import { getQueue } from '../queues.js'
import { User } from '../../models/index.js'
import { redisCache } from '../redis.js'
import { getUserIdFromRemoteId } from './getUserIdFromRemoteId.js'
import { completeEnvironment } from '../backendOptions.js'

const queue = getQueue('getRemoteActorId')

async function getKey(remoteUserUrl: string, adminUser: any): Promise<{ user?: User; key?: string }> {
  const cachedKey = await redisCache.get('key:' + remoteUserUrl)
  let user
  let remoteKey = cachedKey || undefined //if petition from neew user we need to get the key first
  if (!remoteKey) {
    const userId = await getUserIdFromRemoteId(remoteUserUrl)
    if (userId && userId !== '') {
      user = (await User.findByPk(userId)) || undefined
      remoteKey = user?.publicKey ?? ''
    } else {
      await queue.add(
        'getRemoteActorId',
        { actorUrl: remoteUserUrl, userId: adminUser.id, forceUpdate: true },
        {
          jobId: remoteUserUrl.replaceAll(':', '_').replaceAll('/', '_'),
          priority: 2097151
        }
      )
      return {}
    }
  }
  if (!cachedKey && remoteKey) {
    // we set the key valid for 5 minutes
    redisCache.set('key:' + remoteUserUrl, remoteKey, 'EX', 3600)
  }
  return { user: user, key: remoteKey }
}

export { getKey }
