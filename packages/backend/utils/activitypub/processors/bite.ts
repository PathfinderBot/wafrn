import { activityPubObject } from "../../../interfaces/fediverse/activityPubObject.js";
import { Bites } from "../../../models/bites.js";
import { User } from "../../../models/user.js";
import { UserBitesPostRelation } from "../../../models/userBitesPostRelation.js";
import { getDeletedUser } from "../../cacheGetters/getDeletedUser.js";
import { createNotification } from "../../pushNotifications.js";
import { getPostThreadRecursive } from "../getPostThreadRecursive.js";
import { getRemoteActor } from "../getRemoteActor.js";

async function biteActivity(apObject: activityPubObject, remoteUser: User, user: User) {
  if (apObject.target) {
    const deletedUser = await getDeletedUser()
    const userToBeBitten = await getRemoteActor(apObject.target, user)

    if (userToBeBitten && userToBeBitten.id != deletedUser?.id) {
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
          detached: false,
        },
        {
          userUrl: remoteUser.url
        }
      )
    } else {
      const postToBeBitten = await getPostThreadRecursive(user, apObject.target)
      if (postToBeBitten) {
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