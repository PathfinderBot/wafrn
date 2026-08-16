import { Follows, Post, Quotes, User } from '../../models/index.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { redisCache } from '../../utils/redis.js'
import { signAndAccept } from '../../activitypub/signAndAccept.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { getQueue } from '../../utils/queues.js'

const prepareSendPostQueue = getQueue('prepareSendPost')

async function AcceptActivity(body: activityPubObject, remoteUser: User, user: User) {
  const apObject: activityPubObject = body.object
  switch (apObject.type) {
    case 'Follow': {
      if (apObject.id.startsWith(completeEnvironment.frontendUrl)) {
        const followUrl = apObject.id
        const partToRemove = `${completeEnvironment.frontendUrl}/fediverse/follows/`
        const follows = followUrl.substring(partToRemove.length).split('/')
        if (follows.length === 2) {
          const followToUpdate = await Follows.findOne({
            where: {
              followerId: follows[0],
              followedId: follows[1]
            }
          })
          if (followToUpdate) {
            followToUpdate.accepted = true
            await followToUpdate.save()
            redisCache.del('follows:full:' + followToUpdate.followerId)
            redisCache.del('follows:notYetAcceptedFollows:' + followToUpdate.followerId)
          }
        }
      }
      break
    }
    case 'QuoteRequest': {
      if (apObject.instrument && apObject.instrument.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)) {
        let postId = apObject.instrument.split(`${completeEnvironment.frontendUrl}/fediverse/post/`)[1]
        let quoteToUpdate = await Quotes.findOne({
          where: {
            quoterPostId: postId
          }
        })
        if (quoteToUpdate) {
          quoteToUpdate.authorizationUrl = body.result
          await quoteToUpdate.save()
        }
      }
      break
    }
    // FEP-6fce: the remote owner of a manualApproval post accepted our ReplyRequest/AnnounceRequest.
    // Unpend the held post, keep the authorization it gave us, and let it federate for real now.
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
          pendingPost.waitToSendPost = false
          pendingPost.authorizationUrl = typeof body.result === 'string' ? body.result : null
          await pendingPost.save()
          await prepareSendPostQueue.add(
            'prepareSendPost',
            { postId: pendingPost.id, petitionBy: pendingPost.userId },
            { jobId: `${pendingPost.id}-accepted-${Date.now()}` }
          )
        }
      }
      break
    }
    // eslint-disable-next-line no-empty
    default: {
    }
  }
}

export { AcceptActivity }
