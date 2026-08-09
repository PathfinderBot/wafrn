import { Blocks, User } from '../../models/index.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { redisCache } from '../../utils/redis.js'
import { getPostThreadRecursive } from '../../activitypub/getPostThreadRecursive.js'
import { getRemoteActor } from '../../activitypub/getRemoteActor.js'
import { signAndAccept } from '../../activitypub/signAndAccept.js'

async function BlockActivity(body: activityPubObject, remoteUser: User, user: User) {
  const apObject: activityPubObject = body
  const userToBeBlocked = await getRemoteActor(apObject.object, user)
  if (userToBeBlocked) {
    await Blocks.create({
      remoteBlockId: body.id,
      blockedId: userToBeBlocked.id,
      blockerId: remoteUser.id
    })
    redisCache.del('blocks:mutes:onlyUser:' + userToBeBlocked.id)
    redisCache.del('blocks:mutes:' + userToBeBlocked.id)
    redisCache.del('blocks:mutes:' + userToBeBlocked.id)
    redisCache.del('blocks:' + userToBeBlocked.id)

    // await signAndAccept({ body: body }, remoteUser, user)
  }
}

export { BlockActivity }
