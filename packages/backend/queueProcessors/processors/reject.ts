import { Follows, Post, User } from '../../models/index.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { redisCache } from '../../utils/redis.js'
import { getRemoteActor } from '../../activitypub/getRemoteActor.js'
import { signAndAccept } from '../../activitypub/signAndAccept.js'
import { completeEnvironment } from '../../utils/backendOptions.js'

async function RejectActivity(body: activityPubObject, remoteUser: User, user: User) {
  const apObject: activityPubObject = body.object
  switch (apObject?.type) {
    // FEP-6fce: the remote owner of a manualApproval post rejected our ReplyRequest/AnnounceRequest.
    // The post stays held (waitToSendPost never clears, so it never federates) and is flagged detached
    // so it's visible to its author as "not allowed", same as any other disallowed interaction.
    case 'ReplyRequest':
    case 'AnnounceRequest': {
      if (
        apObject.instrument &&
        typeof apObject.instrument === 'string' &&
        apObject.instrument.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)
      ) {
        const postId = apObject.instrument.split(`${completeEnvironment.frontendUrl}/fediverse/post/`)[1]
        const pendingPost = await Post.findByPk(postId)
        if (pendingPost && pendingPost.waitToSendPost) {
          pendingPost.detached = true
          await pendingPost.save()
        }
      }
      break
    }
    case 'Follow':
    default: {
      // someone rejected your follow request :(
      const userWichFollowWasRejected = await getRemoteActor(apObject?.actor, user)
      if (userWichFollowWasRejected) {
        await Follows.destroy({
          where: {
            followedId: remoteUser.id,
            followerId: userWichFollowWasRejected.id
          }
        })
        redisCache.del('follows:full:' + userWichFollowWasRejected.id)
        redisCache.del('follows:notYetAcceptedFollows:' + userWichFollowWasRejected.id)
        // await signAndAccept({ body: body }, remoteUser, user)
      }
      break
    }
  }
}

export { RejectActivity }
