import { SignedRequest } from '../../interfaces/fediverse/signedRequest.js'
import { Response } from 'express'
import { getPostAndUserFromPostId } from '../cacheGetters/getPostAndUserFromPostId.js'
import { logger } from '../logger.js'
import { postToJSONLD } from './postToJSONLD.js'
import { getRemoteActor } from './getRemoteActor.js'
import { getQueue } from '../queues.js'
import { Follows, User } from '../../models/index.js'
import { Op } from 'sequelize'
import { Privacy } from '../../models/post.js'
import { redisCache } from '../redis.js'

const processPostViewQueue = getQueue('processRemoteView')

async function handlePostRequest(req: SignedRequest, res: Response) {
  if (req.params?.id) {
    const cachePost = await getPostAndUserFromPostId(req.params.id)
    const post = cachePost.data
    if (post) {
      // this can leak some posts to fedi but also without it we will get posts with duplicated users (user.at.instance and user@instance)
      // fix: we add a special flag. We give a month or two for other wafrns to update.
      // TODO uncoment this no sooner than august 16th. Given im going on a cruiswe with my very beautiful wife, do after it?
      //if (post.isBskyExclusive && !req.fediData?.specialWafrnAllowBskyPostFlag) {
      //  res.sendStatus(404)
      //  return
      // }
      // we get remote user async-ly
      const fediData = req.fediData as {
        fediHost: string
        remoteUserUrl: string
        valid: boolean
      }
      const user = post.user
      if (user.isRemoteUser) {
        // EXTERNAL USER
        if (post.remotePostId) {
          res.redirect(post.remotePostId)
        } else {
          // bsky post
          res.sendStatus(404)
        }
        return
      }
      if (user.banned) {
        res.sendStatus(410)
        return
      }
      const remoteActor = await getRemoteActor(fediData.remoteUserUrl, cachePost.data.user, false)
      if (!remoteActor || remoteActor?.banned) {
        return res.sendStatus(403)
      } else {
        const federatedHost = await remoteActor.getFederatedHost()
        if (!federatedHost || federatedHost.blocked) {
          return res.sendStatus(403)
        }
        await processPostViewQueue.add('processPost', {
          postId: post.id,
          federatedHostId: federatedHost && federatedHost.publicInbox ? federatedHost.id : '',
          userId: federatedHost?.publicInbox ? '' : remoteActor.id
        })
      }
      if (post.privacy === Privacy.Draft || post.waitToSendPost) {
        return res.sendStatus(404)
      }
      if (post.privacy === Privacy.DirectMessage) {
        return res.sendStatus(403)
      }
      if (post.privacy === Privacy.FollowersOnly) {
        try {
          if (remoteActor) {
            // Optimized: check followers more efficiently
            const isFollower = !!(await Follows.findOne({
              include: [
                {
                  model: User,
                  as: 'follower',
                  where: {
                    federatedHostId: remoteActor.federatedHostId
                  }
                }
              ],
              where: {
                followedId: user.id,
                accepted: true
              }
            }))

            if (!isFollower) {
              res.sendStatus(403)
              return
            }
          } else {
            res.sendStatus(403)
            return
          }
        } catch (error) {
          logger.warn({
            message: 'Error on post',
            postId: post.id,
            fediData: req.fediData,
            user: user.id,
            error: error
          })
          res.sendStatus(500)
          return
        }
      }
      const response = await postToJSONLD(post.id, post)
      if (!response) {
        return res.sendStatus(404)
      }
      res.set({
        'content-type': 'application/activity+json',
        'cache-control': 'public, max-age=300' // Cache for 5 minutes in CDN/reverse proxy
      })
      const jsonResponse = {
        ...response.object,
        '@context': response['@context']
      }
      // Cache the HTTP response for subsequent requests
      await redisCache.set(`postHttpResponse:${post.id}`, JSON.stringify(jsonResponse), 'EX', 300)
      res.send(jsonResponse)
    } else {
      res.sendStatus(404)
    }
  } else {
    res.sendStatus(404)
  }
  res.end()
}

export { handlePostRequest }
