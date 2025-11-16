import { Application, Response } from 'express'
import { authenticateToken } from '../utils/authenticateToken.js'
import { forceUpdateLastActive } from '../utils/forceUpdateLastActive.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { Post } from '../models/post.js'
import { User } from '../models/user.js'
import { logger } from '../utils/logger.js'
import { UserBitesPostRelation } from '../models/userBitesPostRelation.js'
import { createNotification } from '../utils/pushNotifications.js'
import { Bites } from '../models/bites.js'
import { bitePostRemote, biteUserRemote } from '../utils/activitypub/bite.js'
import { biteLimiter } from '../utils/rateLimiters.js'
import { sendBiteBsky } from '../utils/queueProcessors/sendPostBsky.js'

export default function biteRoutes(app: Application) {
  app.post(
    '/api/bitePost',
    biteLimiter,
    authenticateToken,
    forceUpdateLastActive,
    async (req: AuthorizedRequest, res: Response) => {
      const userId = req.jwtData?.userId
      const postId = req.body.postId

      const userPromise = User.findOne({
        where: {
          id: userId
        }
      })

      const postPromise = Post.findOne({
        where: {
          id: postId
        }
      })

      try {
        const user = await userPromise
        const post = await postPromise

        if (!user || !userId) return res.status(404).send({ message: 'User not found' })

        if (!post) return res.status(404).send({ message: 'Post not found' })

        if (post.userId === userId) return res.status(400).send({ message: "You can't bite your own post" })

        const bittenPost = await UserBitesPostRelation.create({
          userId: userId,
          postId: postId
        })

        await createNotification(
          {
            notificationType: 'POSTBITE',
            notifiedUserId: post.userId,
            userId: userId,
            postId: postId
          },
          {
            postContent: post?.content,
            userUrl: user.url
          }
        )

        bitePostRemote(bittenPost)
        await sendBiteBsky(userId, postId, undefined)
      } catch (error) {
        logger.debug({
          message: 'Error biting post',
          error: error
        })

        return res.status(500)
      }

      res.send({ success: true })
    }
  )

  app.post(
    '/api/bite',
    biteLimiter,
    authenticateToken,
    forceUpdateLastActive,
    async (req: AuthorizedRequest, res: Response) => {
      const biterId = req.jwtData?.userId
      const bittenId = req.body.userId

      const biterPromise = User.findOne({
        where: {
          id: biterId
        }
      })

      const bittenPromise = User.findOne({
        where: {
          id: bittenId
        }
      })

      try {
        const biter = await biterPromise
        const bitten = await bittenPromise

        if (!biter || !biterId) return res.status(404).send({ message: 'User not found' })

        if (!bitten) return res.status(404).send({ message: 'User to be bitten not found' })

        if (bittenId === biterId) return res.status(400).send({ message: "You can't bite yourself" })

        await Bites.create({
          biterId: biterId,
          bittenId: bittenId
        })

        await createNotification(
          {
            notificationType: 'USERBITE',
            notifiedUserId: bittenId,
            userId: biterId
          },
          {
            userUrl: biter.url
          }
        )

        biteUserRemote(biter, bitten)
        await sendBiteBsky(biterId, undefined, bittenId)
      } catch (error) {
        logger.debug({
          message: 'Error biting user',
          error: error
        })

        return res.status(500)
      }

      res.send({ success: true })
    }
  )
}
