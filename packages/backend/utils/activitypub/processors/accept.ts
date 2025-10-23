import { Follows, Quotes, User } from '../../../models/index.js'
import { activityPubObject } from '../../../interfaces/fediverse/activityPubObject.js'
import { redisCache } from '../../redis.js'
import { signAndAccept } from '../signAndAccept.js'
import { completeEnvironment } from '../../backendOptions.js'

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
          quoteToUpdate.authorizationUrl = body.id
          await quoteToUpdate.save()
        }
      }
      break
    }
    default: {
    }
  }
}

export { AcceptActivity }
