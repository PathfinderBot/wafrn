import { Follows, ServerBlock, User, UserOptions } from '../../../models/index.js'
import { activityPubObject } from '../../../interfaces/fediverse/activityPubObject.js'
import { createNotification } from '../../pushNotifications.js'
import { acceptRemoteFollow } from '../acceptRemoteFollow.js'
import { getRemoteActor } from '../getRemoteActor.js'
import {} from '../signAndAccept.js'
import { rejectremoteFollow } from '../rejectRemoteFollow.js'
import {} from '../../logger.js'

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
    let autoAcceptFollow = !user.manuallyAcceptsFollows

    const userIsFollowingNewFollower = await Follows.findOne({
      where: {
        followerId: userToBeFollowed.id,
        followedId: remoteUser.id
      }
    })

    if (dbOptionAutoAcceptFollowsFromFollowing?.optionValue === 'true' && userIsFollowingNewFollower) {
      autoAcceptFollow = true
    }

    const blockExisting = await ServerBlock.findAll({
      where: {
        userBlockerId: userToBeFollowed.id,
        blockedServerId: remoteUser.federatedHostId || '00000000-0000-0000-0000-000000000000'
      }
    })

    if (
      (!autoAcceptFollow &&
        dbOptionAutoAcceptFollowsFromFollowing?.optionValue === 'true' &&
        dbOptionAutoRejectFollowsFromUsersYouDoNotFollow?.optionValue === 'true') ||
      blockExisting.length > 0
    ) {
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
        accepted: userToBeFollowed.isRemoteUser ? true : autoAcceptFollow,
        muteQuotes: false,
        muteRewoots: false,
        hideReplies: false
      }
    })
    remoteFollow.remoteFollowId = apObject.id
    await remoteFollow.save()
    // we accept it if user accepts follows automaticaly
    if (remoteFollow.accepted || autoAcceptFollow) {
      if (created) {
        createNotification(
          {
            notificationType: 'FOLLOW',
            userId: remoteUser.id,
            notifiedUserId: userToBeFollowed.id,
            detached: false
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
