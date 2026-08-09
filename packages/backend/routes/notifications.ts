import { Application, Response } from 'express'
import { Op, WhereOptions } from 'sequelize'
import {
  Ask,
  Emoji,
  EmojiReaction,
  Follows,
  Media,
  Notification,
  Post,
  PostEmojiRelations,
  PostReport,
  PostTag,
  PushNotificationToken,
  Quotes,
  ServerBlock,
  UnifiedPushData,
  User,
  UserEmojiRelation,
  UserOptions
} from '../models/index.js'
import { authenticateToken } from '../utils/authenticateToken.js'

import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import { forceUpdateLastActive } from '../utils/forceUpdateLastActive.js'
import { logger } from '../utils/logger.js'
import { UserAttributes } from '../models/user.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getallBlockedServers } from '../utils/cacheGetters/getAllBlockedServers.js'
import { getAtProtoSession } from '../atproto/utils/getAtProtoSession.js'
import { processSinglePost } from '../atproto/utils/getAtProtoThread.js'
import { getNotificationOptions } from '../services/notificationOptions.js'

function notificationRoutes(app: Application) {
  app.get(
    '/api/v3/notificationsScroll',
    authenticateToken,
    forceUpdateLastActive,
    async (req: AuthorizedRequest, res: Response) => {
      let getDetached = req.query.detached == 'true'
      const userId = req.jwtData?.userId ? req.jwtData?.userId : '00000000-0000-0000-0000-000000000000'
      User.findByPk(userId).then(async (usr: any) => {
        if (usr && req.query?.page === '0') {
          usr.lastTimeNotificationsCheck = new Date()
          await usr.save()
        }
      })
      const blockedUsers = await getBlockedIds(userId, true, false)
      let scrollDate = req.query?.date ? new Date(parseInt(req.query.date as string)) : new Date()
      if (isNaN(scrollDate.getTime())) {
        scrollDate = new Date()
      }
      const mutedPostIds = (await getMutedPosts(userId)).concat(await getMutedPosts(userId, true))
      let whereObject: any = {
        [Op.or]: [await getNotificationOptions(userId)],
        postId: {
          [Op.or]: [
            {
              [Op.notIn]: mutedPostIds?.length ? mutedPostIds : ['00000000-0000-0000-0000-000000000000']
            },
            {
              [Op.eq]: null
            }
          ]
        },
        notifiedUserId: userId,
        createdAt: {
          [Op.lt]: scrollDate
        }
      }
      const notifications = await Notification.findAll({
        include: [
          {
            model: User,
            as: 'user',
            required: true,
            where: {
              id: {
                [Op.notIn]: blockedUsers.concat([userId])
              },
              banned: false,
              [Op.or]: [
                {
                  [Op.and]: [
                    {
                      federatedHostId: {
                        [Op.notIn]: await getallBlockedServers()
                      }
                    },
                    {
                      federatedHostId: {
                        [Op.notIn]: (await ServerBlock.findAll({ where: { userBlockerId: userId } })).map(
                          (elem) => elem.blockedServerId
                        )
                      }
                    }
                  ]
                },
                {
                  federatedHostId: {
                    [Op.eq]: null
                  }
                }
              ]
            }
          }
        ],
        where: {
          ...whereObject,
          // this looks like should be the oposite but ok
          detached: !getDetached ? { [Op.eq]: false } : { [Op.ne]: false }
        },
        order: [['createdAt', 'DESC']],
        limit: 20
      })
      const userIds = notifications.map((elem) => elem.userId).concat(userId)
      const postsIds = notifications.map((elem) => elem.postId) as string[]
      const emojiReactionsIds = notifications.filter((elem) => elem.emojiReactionId).map((elem) => elem.emojiReactionId)

      const postsWithQuotes = await Quotes.findAll({
        where: {
          quoterPostId: {
            [Op.in]: notifications.filter((elem) => elem.postId != undefined).map((elem) => elem.postId as string)
          }
        }
      })
      const quotedPostsIds = postsWithQuotes.map((elem) => elem.quotedPostId)

      let users = User.findAll({
        attributes: ['id', 'url', 'name', 'avatar'],
        where: {
          id: {
            [Op.in]: userIds
          }
        },
        raw: true
      })
      const fediAttachmentsDb = await UserOptions.findAll({
        where: {
          userId: {
            [Op.in]: userIds
          },
          optionName: 'fediverse.public.attachment'
        }
      })
      const usersPronounsMap: Map<string, string | undefined> = new Map()
      for (const att of fediAttachmentsDb) {
        const fediAttachments: { name: string; value: string }[] = JSON.parse(att.optionValue)
        const pronouns = fediAttachments.find((elem) => elem.name.toLowerCase() === 'pronouns')?.value
        if (!pronouns) continue
        usersPronounsMap.set(att.userId, pronouns)
      }
      let posts = Post.findAll({
        where: {
          id: {
            [Op.in]: [...postsIds, ...quotedPostsIds]
          }
        }
      })
      let asks = Ask.findAll({
        where: {
          postId: {
            [Op.in]: postsIds
          }
        }
      })
      let medias = Media.findAll({
        attributes: [
          'id',
          'NSFW',
          'description',
          'url',
          'external',
          'mediaOrder',
          'mediaType',
          'postId',
          'blurhash',
          'width',
          'height'
        ],
        where: {
          postId: {
            [Op.in]: postsIds
          }
        }
      })
      let tags = PostTag.findAll({
        where: {
          postId: {
            [Op.in]: postsIds
          }
        }
      })
      let userEmojis = UserEmojiRelation.findAll({
        where: {
          userId: {
            [Op.in]: userIds
          }
        }
      })
      let postEmojis = PostEmojiRelations.findAll({
        where: {
          postId: {
            [Op.in]: postsIds
          }
        }
      })
      let emojiReactions = EmojiReaction.findAll({
        where: {
          id: {
            [Op.in]: emojiReactionsIds
          }
        }
      })

      const [_emojiReactions, _userEmojis, _postEmojis] = await Promise.all([emojiReactions, userEmojis, postEmojis])

      let emojisToGet = _emojiReactions
        .map((elem) => elem.emojiId)
        .concat(_userEmojis.map((elem) => elem.emojiId))
        .concat(_postEmojis.map((elem) => elem.emojiId))

      const emojis = await Emoji.findAll({
        where: {
          id: {
            [Op.in]: emojisToGet
          }
        }
      })

      // not including emoji promises here as they were already awaited above
      await Promise.all([users, posts, asks, tags, medias])
      const awaitedPostsIds = (await posts).map((post) => post.id)
      const notificationsFiltered = notifications.filter(
        (elem) =>
          elem.notificationType === 'FOLLOW' ||
          elem.notificationType === 'USERBITE' ||
          (elem.postId && awaitedPostsIds.includes(elem.postId))
      )

      res.send({
        notifications: notificationsFiltered,
        users: (await users).map((x) => {
          const pronouns = usersPronounsMap.get(x.id)
          return {
            ...x,
            ...(pronouns
              ? {
                  pronouns
                }
              : {})
          }
        }),
        posts: await posts,
        medias: await medias,
        asks: await asks,
        tags: await tags,
        quotes: postsWithQuotes,
        emojiRelations: {
          userEmojiRelation: _userEmojis,
          postEmojiRelation: _postEmojis,
          postEmojiReactions: _emojiReactions,
          emojis: emojis
        }
      })
    }
  )

  app.get('/api/v2/notificationsCount', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId ? req.jwtData?.userId : '00000000-0000-0000-0000-000000000000'
    const user = await User.findByPk(userId)
    if (user?.enableBsky && completeEnvironment.enableBsky && user?.bskyDid) {
      try {
        /**
         * We do this thing asyncronously, no need to wait. we try obtaining replies, as its the most important bit!
         * No need to block this petition, or if this fails or anything
         */
        getAtProtoSession(user)
          .then(async (session) => {
            try {
              let notificationsPetition = await session.listNotifications({
                reasons: ['mention', 'reply', 'quote'],
                limit: 20
              })
              if (notificationsPetition.success) {
                const uris = notificationsPetition.data.notifications.map((elem) => elem.uri)
                const foundPosts = await Post.findAll({
                  attributes: ['bskyUri'],
                  where: {
                    bskyUri: {
                      [Op.in]: uris
                    }
                  }
                })
                const foundUris = foundPosts.map((elem) => elem.bskyUri)
                await Promise.all(
                  notificationsPetition.data.notifications
                    .filter((elem) => !foundUris.includes(elem.uri))
                    .map((elem) => processSinglePost(elem.uri))
                )
              }
            } catch (error) {
              logger.error({
                message: `Error obtaining bsky notifications for user ${user.url}`,
                error: error
              })
            }
          })
          .catch((error) => {
            logger.info({
              message: `User ${user.url} issue obtaining bsky notificaitons`,
              error: error
            })
          })
      } catch (error) {
        logger.info({
          message: `User ${user.url} issue obtaining bsky notificaitons. Throw error`,
          error: error
        })
      }
    }
    const blockedUsers = await getBlockedIds(userId, false)
    const startCountDate = user?.lastTimeNotificationsCheck
    const mutedPostIds = (await getMutedPosts(userId)).concat(await getMutedPosts(userId, true))
    const notificationsCount = await Notification.count({
      include: [
        {
          model: User,
          as: 'user',
          required: true,
          where: {
            id: {
              [Op.notIn]: blockedUsers.concat([userId])
            },
            banned: false,
            [Op.or]: [
              {
                [Op.and]: [
                  {
                    federatedHostId: {
                      [Op.notIn]: await getallBlockedServers()
                    }
                  },
                  {
                    federatedHostId: {
                      [Op.notIn]: (await ServerBlock.findAll({ where: { userBlockerId: userId } })).map(
                        (elem) => elem.blockedServerId
                      )
                    }
                  }
                ]
              },
              {
                federatedHostId: {
                  [Op.eq]: null
                }
              }
            ]
          }
        }
      ],
      where: {
        detached: {
          [Op.ne]: true
        },
        notifiedUserId: userId,
        [Op.or]: [await getNotificationOptions(userId)],
        postId: {
          [Op.or]: [
            {
              [Op.notIn]: mutedPostIds?.length ? mutedPostIds : ['00000000-0000-0000-0000-000000000000']
            },
            {
              [Op.eq]: null
            }
          ]
        },
        userId: {
          [Op.notIn]: blockedUsers.concat([userId])
        },
        createdAt: {
          [Op.gt]: startCountDate
        }
      }
    })
    const pendingFollows = Follows.count({
      where: {
        followedId: userId,
        accepted: false
      }
    })
    let reports = Promise.resolve(0)
    let usersAwaitingApproval = Promise.resolve(0)

    if (req.jwtData?.role === 10) {
      // well the user is an admin!
      reports = PostReport.count({
        where: {
          resolved: false
        }
      })

      const whereConditions: WhereOptions<UserAttributes> = {
        activated: false,
        url: {
          [Op.notLike]: '%@%'
        },
        banned: false
      }
      if (!completeEnvironment.disableRequireSendEmail) {
        whereConditions.emailVerified = true
      }

      usersAwaitingApproval = User.count({
        where: whereConditions
      })
    }

    let unansweredAsks = Ask.count({
      where: {
        userAsked: userId,
        answered: false,
        postId: null
      }
    })
    await Promise.all([reports, usersAwaitingApproval, pendingFollows])

    res.send({
      notifications: notificationsCount,
      followsAwaitingApproval: await pendingFollows,
      reports: await reports,
      usersAwaitingApproval: await usersAwaitingApproval,
      asks: await unansweredAsks
    })
  })

  app.post('/api/v3/registerNotificationToken', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId
    const token = req.body.token

    if (!userId || !token) {
      return res.status(401).send({
        success: false,
        error: 'Invalid request. Missing auth token (in auth header) or notification token (in request body).'
      })
    }

    try {
      const existingToken = await PushNotificationToken.findByPk(token)

      if (existingToken) {
        return res.send({ success: true, message: 'Token already registered.' })
      }

      await PushNotificationToken.create({ token, userId })

      res.send({ success: true, message: 'New token registered.' })
    } catch (error) {
      logger.error(error)
      res.status(500).send({ success: false, message: 'Error registering token.' })
    }
  })

  app.post('/api/v3/unregisterNotificationToken', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId
    const { token } = req.body

    if (!userId || !token) {
      return res.status(400).send({
        success: false,
        error: 'Invalid request. Missing userId in token or token in request body.'
      })
    }

    try {
      await PushNotificationToken.destroy({
        where: {
          token,
          userId
        }
      })
      res.send({ success: true, message: 'Notification token unregistered.' })
    } catch (err) {
      logger.error(err)
      res.status(500).send({ success: false, error: 'Error unregistering notification token.' })
    }
  })

  app.post('/api/v3/registerUnifiedPushData', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId
    const { endpoint, deviceAuth, devicePublicKey } = req.body

    if (!userId || !endpoint || !deviceAuth || !devicePublicKey) {
      return res.status(400).send({
        success: false,
        error: 'Invalid request. Missing userId in token or endpoint, deviceAuth, devicePublicKey in request body.'
      })
    }

    try {
      const existingToken = await UnifiedPushData.findOne({
        where: {
          userId,
          endpoint
        }
      })

      if (existingToken) {
        return res.send({ success: true, message: 'Unified push endpoint already registered.' })
      } else {
        await UnifiedPushData.create({ userId, endpoint, deviceAuth, devicePublicKey })
        res.send({ success: true, message: 'Unified push data registered.' })
      }
    } catch (err) {
      logger.error(err)
      res.status(500).send({ success: false, error: 'Error registering unified push data.' })
    }
  })

  app.post('/api/v3/unregisterUnifiedPushData', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId
    const { endpoint } = req.body

    if (!userId || !endpoint) {
      return res.status(400).send({
        success: false,
        error: 'Invalid request. Missing userId in token or endpoint in request body.'
      })
    }

    try {
      await UnifiedPushData.destroy({
        where: {
          userId,
          endpoint
        }
      })
      res.send({ success: true, message: 'Unified push data unregistered.' })
    } catch (err) {
      logger.error(err)
      res.status(500).send({ success: false, error: 'Error unregistering unified push data.' })
    }
  })
}

export { notificationRoutes }
