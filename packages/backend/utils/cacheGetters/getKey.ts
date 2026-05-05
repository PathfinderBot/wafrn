import { User } from '../../models/index.js'
import { redisCache } from '../redis.js'
import { getUserIdFromRemoteId } from './getUserIdFromRemoteId.js'
import { getRemoteActor } from '../activitypub/getRemoteActor.js'
import { getAdminUser } from '../getAdminAndDeletedUser.js'


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
      const res = await getRemoteActor('remoteUserUrl', await getAdminUser(), false )
      user = res;
      remoteKey = user?.publicKey || ''
      if(!user){
        return {}
      }
    }
  }
  if (!cachedKey && remoteKey) {
    // we set the key valid for 5 minutes
    redisCache.set('key:' + remoteUserUrl, remoteKey, 'EX', 3600)
  }
  return { user: user, key: remoteKey }
}

export { getKey }
