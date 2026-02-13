import { Application, Response } from 'express'
import { authenticateToken } from '../utils/authenticateToken.js'

import { Notification, Post, User, UserLikesPostRelations } from '../models/index.js'
import { logger } from '../utils/logger.js'
import { likePostRemote } from '../utils/activitypub/likePost.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { getUserOptions } from '../utils/cacheGetters/getUserOptions.js'
import { getAtProtoSession } from '../atproto/utils/getAtProtoSession.js'
import { Model } from 'sequelize'
import { forceUpdateLastActive } from '../utils/forceUpdateLastActive.js'
import { createNotification } from '../utils/pushNotifications.js'
import { InteractionControl } from '../models/post.js'
import { canInteract } from '../utils/baseQueryNew.js'

export default function likeRoutes(app: Application) {
  app.post('/api/like', authenticateToken, forceUpdateLastActive, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    const userId = req.jwtData?.userId
    const postId = req.body.postId
    let bskyUri = undefined
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
    const likePromise = UserLikesPostRelations.findOne({
      where: {
        userId: userId,
        postId: postId
      }
    })
    try {
      await Promise.all([userPromise, postPromise, likePromise])
      const user = await userPromise
      const post = await postPromise
      const like = await likePromise
      if (userId && user && post && !like) {
        // TODO check if user can LIKE post.
        if(!await canInteract(post.likeControl, userId, post.id)) {
          res.status(403)
          return res.send({
            success: false,
            message: 'This post has interaction controls and you do not have permission to like it'
          })
        }

        const options = await getUserOptions(user.id)
        const userFederatesWithThreads = options.filter(
          (elem) => elem.optionName === 'wafrn.federateWithThreads' && elem.optionValue === 'true'
        )
        if (userFederatesWithThreads.length === 0) {
          const userPosterOfPostToBeLiked = await User.findByPk(post.userId)
          if (userPosterOfPostToBeLiked?.url.toLowerCase().endsWith('.threads.net')) {
            res.status(403)
            res.send({ error: true, message: 'You do not have threads federation enabled' })
            return
          }
        }
        if (!user.enableBsky && !user.bskyDid && post.bskyUri ) {
          const userPosterOfPostToBeLiked = (await User.findByPk(post.userId)) as User
          if (userPosterOfPostToBeLiked.isRemoteUser) {
            res.status(403)
            res.send({ error: true, message: 'You do not have bluesky enabled' })
            return
          }
        } else {
          if (user.enableBsky && post.bskyUri && user.bskyDid) {
            try {
              const agent = await getAtProtoSession(user)
              const { uri } = await agent.like(post.bskyUri, post.bskyCid as string)
              bskyUri = uri
            } catch (error) {
              logger.debug({
                message: `Error while sending a bluesky post`,
                postId: post.id,
                user: user.url,
                error: error
              })
            }
          }
        }
        const likedPost = await UserLikesPostRelations.create({
          userId: userId,
          postId: postId,
          bskyPath: bskyUri
        })
        await likedPost.save()
        await createNotification(
          {
            notificationType: 'LIKE',
            notifiedUserId: post.userId,
            userId: userId,
            postId: postId,
            detached: false
          },
          {
            postContent: post?.content,
            userUrl: user.url
          }
        )
        success = true
        likePostRemote(likedPost)
      }
      if (like) {
        success = true
      }
    } catch (error) {
      logger.debug(error)
    }
    res.send({ success: success })
  })

  app.post('/api/unlike', authenticateToken, forceUpdateLastActive, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    const userId = req.jwtData?.userId
    const postId = req.body.postId
    const like = await UserLikesPostRelations.findOne({
      where: {
        userId: userId,
        postId: postId
      }
    })
    await Notification.destroy({
      where: {
        notificationType: 'LIKE',
        userId: userId,
        postId: postId
      }
    })
    if (like && like.bskyPath) {
      const user = await User.findByPk(userId)
      if (user && user.enableBsky && user.bskyDid) {
        const agent = await getAtProtoSession(user)
        await agent.deleteLike(like.bskyPath)
      }
    }
    if (like) {
      likePostRemote(like, true)
      await like.destroy()
      success = true
    }

    res.send({ success: success })
  })
}
