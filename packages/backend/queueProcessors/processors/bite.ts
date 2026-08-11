import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { Bites } from '../../models/bites.js'
import { User } from '../../models/user.js'
import { UserBitesPostRelation } from '../../models/userBitesPostRelation.js'
import { getDeletedUser } from '../../utils/cacheGetters/getDeletedUser.js'
import { createNotification } from '../../services/pushNotifications.js'
import { getPostThreadRecursive } from '../../activitypub/getPostThreadRecursive.js'
import { getRemoteActor } from '../../activitypub/getRemoteActor.js'
import { userAllowsBiteFrom } from '../../utils/allowsBites.js'

async function biteActivity(apObject: activityPubObject, remoteUser: User, user: User) {
  if (apObject.target) {
    const deletedUser = await getDeletedUser()
    const userToBeBitten = await getRemoteActor(apObject.target, user)

    if (userToBeBitten && userToBeBitten.id != deletedUser?.id) {
      if (!(await userAllowsBiteFrom(userToBeBitten.id, remoteUser.id))) {
        return
      }

      await Bites.create({
        biterId: remoteUser.id,
        bittenId: userToBeBitten.id,
        remoteId: apObject.id
      })

      await createNotification(
        {
          notificationType: 'USERBITE',
          userId: remoteUser.id,
          notifiedUserId: userToBeBitten.id,
          detached: false
        },
        {
          userUrl: remoteUser.url
        }
      )
    } else {
      const postToBeBitten = await getPostThreadRecursive(user, apObject.target)
      if (postToBeBitten && (await userAllowsBiteFrom(postToBeBitten.userId, remoteUser.id))) {
        await UserBitesPostRelation.create({
          userId: remoteUser.id,
          postId: postToBeBitten.id,
          remoteId: apObject.id
        })

        await createNotification(
          {
            notificationType: 'POSTBITE',
            userId: remoteUser.id,
            notifiedUserId: postToBeBitten.userId,
            postId: postToBeBitten.id,
            detached: false
          },
          {
            postContent: postToBeBitten.content,
            userUrl: remoteUser.url
          }
        )
      }
    }
  }
}

export { biteActivity }
