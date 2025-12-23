import { Follows, Notification, User, UserOptions } from '../../../models/index.js'
import { activityPubObject } from '../../../interfaces/fediverse/activityPubObject.js'
import { createNotification } from '../../pushNotifications.js'
import { acceptRemoteFollow } from '../acceptRemoteFollow.js'
import { getRemoteActor } from '../getRemoteActor.js'
import { signAndAccept } from '../signAndAccept.js'
import { rejectremoteFollow } from '../rejectRemoteFollow.js'
import { logger } from '../../logger.js'

async function FollowActivity(body: activityPubObject, remoteUser: User, user: User) {
  const apObject: activityPubObject = body
  // Follow user
  const userToBeFollowed = await getRemoteActor(apObject.object, user)
  if (userToBeFollowed) {
    const dbOptionAutoAcceptFollowsFromFollowing = await UserOptions.findOne({
      where: {
        userId: userToBeFollowed.id,
        optionName: 'wafrn.autoAcceptFollowsFromFollowing'
      }
    })
    const dbOptionAutoRejectFollowsFromUsersYouDoNotFollow = await UserOptions.findOne({
      where: {
        userId: userToBeFollowed.id,
        optionName: 'wafrn.autoRejectFollowsFromUsersYouDoNotFollow'
      }
    })
    let autoFollowThisUser = !userToBeFollowed.manuallyAcceptsFollows;
    if (dbOptionAutoAcceptFollowsFromFollowing?.optionValue === 'true') {
      autoFollowThisUser = await Follows.findOne({
        where: {
          followerId: userToBeFollowed.id,
          followedId: remoteUser.id
        }
      }).then(f => !!f)
    }
    if (
      !autoFollowThisUser &&
      dbOptionAutoAcceptFollowsFromFollowing?.optionValue === 'true' &&
      dbOptionAutoRejectFollowsFromUsersYouDoNotFollow?.optionValue === 'true'
    ) {
      logger.info({ followed: userToBeFollowed.url, follower: remoteUser.id, autoFollowThisUser }, 'Rejecting follow of user')
      await rejectremoteFollow(userToBeFollowed.id, remoteUser.id)
      return
    }
    let [remoteFollow, created] = await Follows.findOrCreate({
      where: {
        followerId: remoteUser.id,
        followedId: userToBeFollowed.id
      },
      defaults: {
        followerId: remoteUser.id,
        followedId: userToBeFollowed.id,
        remoteFollowId: apObject.id,
        accepted: userToBeFollowed.isRemoteUser ? true : autoFollowThisUser,
        muteQuotes: false,
        muteRewoots: false
      }
    })
    remoteFollow.remoteFollowId = apObject.id
    await remoteFollow.save()
    // we accept it if user accepts follows automaticaly
    if (remoteFollow.accepted) {
      if (created) {
        createNotification(
          {
            notificationType: 'FOLLOW',
            userId: remoteUser.id,
            notifiedUserId: userToBeFollowed.id
          },
          {
            userUrl: remoteUser.url
          }
        )
      }
      await acceptRemoteFollow(userToBeFollowed.id, remoteUser.id)
    }
  }
}

export { FollowActivity }
