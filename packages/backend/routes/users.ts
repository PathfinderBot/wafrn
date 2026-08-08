import { Application, Response } from 'express'
import { Op } from 'sequelize'
import {
  Ask,
  Blocks,
  Emoji,
  FederatedHost,
  Follows,
  Mutes,
  Post,
  ServerBlock,
  User,
  UserBookmarkedPosts,
  UserEmojiRelation,
  UserOptions
} from '../models/index.js'
import { authenticateToken } from '../utils/authenticateToken.js'
import getIp from '../utils/getIP.js'
import { sequelize } from '../models/index.js'
import optimizeMedia from '../utils/optimizeMedia.js'
import uploadHandler from '../utils/uploads.js'
import { logger } from '../utils/logger.js'
import { navigationRateLimiter, onePerSecondLimiter } from '../utils/rateLimiters.js'
import fs from 'fs/promises'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import optionalAuthentication from '../utils/optionalAuthentication.js'
import { redisCache } from '../utils/redis.js'
import getFollowedsIds from '../utils/cacheGetters/getFollowedsIds.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import { getNotYetAcceptedFollowedids } from '../utils/cacheGetters/getNotYetAcceptedFollowedIds.js'
import { getUserOptions } from '../utils/cacheGetters/getUserOptions.js'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import { getAvaiableEmojisUncached } from '../utils/getAvaiableEmojisUncached.js'
import { getMutedUsers } from '../utils/cacheGetters/getMutedUsers.js'
import { getAvaiableEmojisCache } from '../utils/cacheGetters/getAvaiableEmojis.js'
import { rejectremoteFollow } from '../activitypub/rejectRemoteFollow.js'
import { acceptRemoteFollow } from '../activitypub/acceptRemoteFollow.js'
import showdown from 'showdown'
import { getAtProtoSession } from '../atproto/utils/getAtProtoSession.js'
import dompurify from 'isomorphic-dompurify'
import { getFollowedHashtags } from '../utils/cacheGetters/getFollowedHashtags.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { sendUpdateProfile } from '../activitypub/sendUpdateProfile.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { isAdult } from '../utils/isAdult.js'
import { getRemoteActor } from '../activitypub/getRemoteActor.js'
import { migrateUserFedi } from '../activitypub/migrateUser.js'
import { LANGUAGES } from '../utils/languages.js'
import { pinPost } from '../activitypub/likePost.js'
import { pinPostOnBluesky, updateBlueskyProfile } from '../services/bskyAccount.js'

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true
})

const slurs = [
  'chinaman',
  'chinamen',
  'chink',
  'coolie',
  'coon',
  'eskimo',
  'golliwog',
  'gook',
  'gyp',
  'gypsy',
  'half-breed',
  'halfbreed',
  'heeb',
  'jap',
  'kaffer',
  'kaffir',
  'kaffir',
  'kaffre',
  'kafir',
  'kike',
  'kraut',
  'negress',
  'negro',
  'nig',
  'nig-nog',
  // 'nigga', // this one is reclaimable for what I understand. Salem uses it.
  'nigger',
  'nigguh',
  'pajeet',
  'paki',
  'pickaninnie',
  'pickaninny',
  'raghead',
  'retard',
  'sambo',
  'shemale',
  'soyboy',
  'spade',
  'sperg',
  'spic',
  'squaw',
  'tard',
  'wetback',
  'wigger',
  'wop',
  'yid'
]

function userRoutes(app: Application) {
  app.post(
    '/api/updateCSS',
    authenticateToken,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      const posterId = req.jwtData?.userId
      const cssContent = req.body.css ? req.body.css.trim() : undefined
      if (req.body.css) {
        try {
          await fs.writeFile(`uploads/themes/${posterId}.css`, req.body.css)
          res.send({ success: true })
        } catch (error) {
          logger.warn(error)
          res.status(500)
          res.send({ error: true })
        }
      } else {
        try {
          await fs.unlink(`uploads/themes/${posterId}.css`)
          res.send({ success: true })
        } catch (error) {
          logger.warn(error)
          res.status(500)
          res.send({ error: true })
        }
      }
      // also federate changes
      const user = await User.findByPk(posterId)
      if (user) await sendUpdateProfile(user)
    }
  )

  app.post(
    '/api/editProfile',
    authenticateToken,
    uploadHandler().fields([
      { name: 'avatar', maxCount: 1 },
      { name: 'headerImage', maxCount: 1 }
    ]),
    async (req: AuthorizedRequest, res: Response) => {
      let success = false
      try {
        const posterId = req.jwtData?.userId as string
        const user = await User.scope('full').findOne({
          where: {
            id: posterId
          }
        })
        if (req.body && user) {
          const {
            hideFollows,
            hideProfileNotLoggedIn,
            name,
            description,
            manuallyAcceptsFollows,
            options: optionJSON
          } = req.body

          const avaiableEmojis = await getAvaiableEmojisUncached()
          let userEmojis: any[] = []
          user.manuallyAcceptsFollows = manuallyAcceptsFollows == 'true'
          user.hideFollows = hideFollows == 'true'
          user.hideProfileNotLoggedIn = hideProfileNotLoggedIn == 'true'
          user.disableEmailNotifications = req.body.disableEmailNotifications == 'true'
          user.isBot = req.body.isBot == 'true'
          if (description) {
            const descriptionHtml = markdownConverter.makeHtml(description)
            user.description = descriptionHtml
            user.descriptionMarkdown = description
            userEmojis = userEmojis.concat(avaiableEmojis?.filter((emoji: any) => description.includes(emoji.name)))
          }

          if (name) {
            user.name = name
            userEmojis = userEmojis.concat(avaiableEmojis?.filter((emoji: any) => name.includes(emoji.name)))
          }

          const avatar = (req?.files as any)?.avatar?.[0]
          const headerImage = (req?.files as any)?.headerImage?.[0]

          if (avatar != null) {
            let url = `/${await optimizeMedia(avatar.path, {
              forceImageExtension: 'webp'
            })}`
            if (completeEnvironment.removeFolderNameFromFileUploads) {
              url = url.slice('/uploads/'.length - 1)
            }
            user.avatar = url
          }
          if (headerImage != null) {
            let url = `/${await optimizeMedia(headerImage.path, {
              forceImageExtension: 'webp'
            })}`
            if (completeEnvironment.removeFolderNameFromFileUploads) {
              url = url.slice('/uploads/'.length - 1)
            }
            user.headerImage = url
          }

          await UserEmojiRelation.destroy({
            where: {
              userId: user.id
            }
          })
          await user.removeEmojis()
          user.setEmojis([...new Set(userEmojis)])
          redisCache.del('userOptions:' + posterId)
          await user.save()

          await updateProfileOptions(optionJSON, posterId)
          if (user.enableBsky && user.bskyDid) {
            const bskySession = await getAtProtoSession(user)
            await updateBlueskyProfile(bskySession, user)
          }
          // force update fedi profile
          await redisCache.del('fediverse:user:base:' + posterId)
          await sendUpdateProfile(user)
          success = true
        }
      } catch (error) {
        logger.error(error)
      }

      res.send({
        success
      })
    }
  )

  app.post('/api/editOptions', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    try {
      const userId = req.jwtData?.userId
      const options = req.body.options
      if (userId && options) {
        await updateProfileOptions(JSON.stringify(options), userId)
      }
      await redisCache.del('userOptions:' + userId)
      await redisCache.del('fediverse:user:base:' + userId)
    } catch (error) {
      logger.info({
        message: 'Error updating user options',
        error: error
      })
    }
    res.send({ success: success })
  })

  app.get('/api/user/exportFollows', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const user = (await User.findByPk(req.jwtData?.userId as string)) as User
    const myFollows = await Follows.findAll({
      include: [
        {
          model: User,
          attributes: ['url'],
          as: 'followed',
          required: true
        }
      ],
      where: {
        followerId: user.id
      }
    })

    const followList = myFollows.map((elem: any) =>
      elem.followed.url.startsWith('@') ? elem.followed.url : `@${elem.followed.url}@${completeEnvironment.instanceUrl}`
    )

    res.send(followList)
  })

  app.get(
    '/api/user/:url/refetchData',
    optionalAuthentication,
    onePerSecondLimiter,
    async (req: AuthorizedRequest, res) => {
      const url = req.params?.url as string
      const userId = req.jwtData?.userId ? req.jwtData?.userId : '00000000-0000-0000-0000-000000000000'
      const userToRefetch = await User.findOne({
        where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase())
      })
      const user = await User.findByPk(userId)
      if (!userToRefetch || !userToRefetch.remoteId) {
        res.status(404).send({ status: 'not_found' })
        return
      }
      await getRemoteActor(userToRefetch?.remoteId, user, true)
      res.status(200).send({ status: 'ok' })
    }
  )

  app.get('/api/user', optionalAuthentication, async (req: AuthorizedRequest, res) => {
    let success = false
    if (req.query?.id) {
      const userId = req.jwtData?.userId ? req.jwtData?.userId : '00000000-0000-0000-0000-000000000000'
      const blogId: string = (req.query.id || '').toString().toLowerCase().trim()
      const blog = await User.findOne({
        attributes: [
          'id',
          'url',
          'name',
          'createdAt',
          'description',
          'descriptionMarkdown',
          'remoteId',
          'isBot',
          'avatar',
          'federatedHostId',
          'headerImage',
          'followingCount',
          'followerCount',
          'manuallyAcceptsFollows',
          'bskyDid',
          'role',
          'userMigratedTo',
          'displayUrl',
          'isBskyPrimary',
          'alternateUrl',
          [sequelize.literal(`"id" = '${userId}' AND "enableBsky"`), 'enableBsky'],
          [sequelize.literal(`"id" = '${userId}' AND "disableEmailNotifications"`), 'disableEmailNotifications'],
          [sequelize.literal(`"id" = '${userId}' AND "hideProfileNotLoggedIn"`), 'hideProfileNotLoggedIn'],
          [sequelize.literal(`"id" = '${userId}' AND "hideFollows"`), 'hideFollows']
        ],
        include: [
          {
            model: Emoji,
            required: false
          },
          {
            model: FederatedHost,
            required: false
          }
        ],
        where: {
          [Op.or]: [
            sequelize.where(sequelize.fn('lower', sequelize.col('url')), blogId),
            {
              bskyDid: blogId
            },
            sequelize.where(sequelize.fn('lower', sequelize.col('alternateUrl')), blogId)
          ],
          banned: {
            [Op.ne]: true
          }
        }
      })
      if (blog && !isAdult(req.jwtData?.birthDate) && req.jwtData?.role !== 10 && blog.id !== req.jwtData?.userId) {
        const user = await User.findByPk(blog.id)
        if (user?.NSFW) {
          res.sendStatus(404)
          return
        }
      }
      if (blog && !req.jwtData) {
        const user = await User.findByPk(blog.id, {
          attributes: ['hideProfileNotLoggedIn']
        })
        if (user?.hideProfileNotLoggedIn) {
          res.sendStatus(404)
          return
        }
      }
      if (!blog || blog.federatedHost?.blocked) {
        res.sendStatus(404)
        return
      }
      let followed = blog.isRemoteUser
        ? blog.followingCount
        : Follows.count({
            where: {
              followerId: blog.id,
              accepted: true
            }
          })
      let followers = blog.isRemoteUser
        ? blog.followerCount
        : Follows.count({
            where: {
              followedId: blog.id,
              accepted: true
            }
          })
      const publicOptions = UserOptions.findAll({
        where: {
          userId: blog.id,
          public: true
        }
      })
      let muted = false
      let blocked = false
      let serverBlocked = false || blog?.federatedHost?.blocked
      if (req.jwtData?.userId && blog) {
        const mutedQuery = Mutes.count({
          where: {
            muterId: req.jwtData.userId,
            mutedId: blog.id
          }
        })
        const blockedQuery = Blocks.count({
          where: {
            blockerId: req.jwtData.userId,
            blockedId: blog.id
          }
        })
        const serverBlockedQuery = await ServerBlock.count({
          where: {
            userBlockerId: req.jwtData.userId as string,
            blockedServerId: blog.federatedHostId as string
          }
        })
        await Promise.all([mutedQuery, blockedQuery, serverBlockedQuery, followed, followers, publicOptions])
        muted = (await mutedQuery) === 1
        blocked = (await blockedQuery) === 1
        serverBlocked = serverBlocked || (await serverBlockedQuery) === 1
      } else {
        await Promise.all([followed, followers])
      }

      const postCount = blog
        ? await Post.count({
            where: {
              userId: blog.id
            }
          })
        : 0

      followed = await followed
      followers = await followers
      let migratedTo: User | null = null
      if (blog.userMigratedTo) {
        let splitMigratedUrl = blog.userMigratedTo.split('/')
        migratedTo = await User.findOne({
          where: {
            [Op.or]: [
              {
                remoteId: blog.userMigratedTo
              },
              {
                remoteMentionUrl: blog.userMigratedTo
              },
              {
                url: splitMigratedUrl[splitMigratedUrl.length - 1]
              }
            ]
          }
        })
      }
      success = !!blog
      if (success) {
        res.send({
          ...blog.dataValues,
          isBlueskyUser: blog.isBlueskyUser,
          isFediverseUser: blog.isFediverseUser,
          postCount,
          migratedTo: migratedTo?.url,
          muted,
          blocked,
          serverBlocked,
          followed,
          followers,
          isAdmin: blog.dataValues.role === 10,
          publicOptions: await publicOptions
        })
      }
    }

    if (!success) {
      res.send({ success: false })
    }
  })

  app.get('/api/my-ui-options', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId as string
    const followedUsers = getFollowedsIds(userId)
    const myFollowers = getFollowedsIds(userId, false, {
      getFollowersInstead: true
    })

    const blockedUsers = getBlockedIds(userId)
    const notAcceptedFollows = getNotYetAcceptedFollowedids(userId)
    const options = getUserOptions(userId)
    const localEmojis = getAvaiableEmojisCache()
    const mutedUsers = getMutedUsers(userId)
    let userPromise = User.findByPk(req.jwtData?.userId, {
      attributes: ['banned', 'enableBsky', 'bskyDid']
    })
    const silencedPosts = getMutedPosts(userId)
    const followedHashtags = getFollowedHashtags(userId)
    Promise.all([
      userPromise,
      followedUsers,
      blockedUsers,
      notAcceptedFollows,
      options,
      silencedPosts,
      localEmojis,
      mutedUsers,
      followedHashtags,
      myFollowers
    ])
    const user = await userPromise
    if (!user || user.banned) {
      res.sendStatus(401)
    } else {
      const user = (await userPromise) as User
      const mutedQuotes = (
        await Follows.findAll({
          where: {
            followerId: userId,
            muteQuotes: true
          }
        })
      ).map((elem) => elem.followedId)

      const mutedRewoots = (
        await Follows.findAll({
          where: {
            followerId: userId,
            muteRewoots: true
          }
        })
      ).map((elem) => elem.followedId)

      const hiddenReplies = (
        await Follows.findAll({
          where: {
            followerId: userId,
            hideReplies: true
          }
        })
      ).map((elem) => elem.followedId)

      // TODO: get this type from a database model object (maybe add more info?)
      type ServiceAnnouncement = {
        level: 'error' | 'info' | 'warning'
        code: string // code can be used to quickly identify the type of message, for example to take action depending on that (it can be a different depending on client: web, app, ...etc)
        message: string
      }

      const serviceAnnouncements = [] as ServiceAnnouncement[]
      if (user.bskyDid && !user.enableBsky) {
        serviceAnnouncements.push({
          level: 'error',
          code: 'bsky_account_force_disabled',
          message:
            'Bluesky integration for your account was disabled because of an internal error. Please go to the enable bluesky page and re-enable it.'
        })
      }

      res.send({
        myFollowers: await myFollowers,
        followedUsers: await followedUsers,
        blockedUsers: await blockedUsers,
        notAcceptedFollows: await notAcceptedFollows,
        options: await options,
        silencedPosts: await silencedPosts,
        emojis: await localEmojis,
        mutedUsers: await mutedUsers,
        followedHashtags: await followedHashtags,
        enableBluesky: user.enableBsky && user.bskyDid,
        languages: LANGUAGES,
        // TODO: create a table for "service annonuncements" where we can this (and maybe direct them to specific users)
        serviceAnnouncements,
        mutedRewoots,
        mutedQuotes,
        hiddenReplies
      })
    }
  })

  app.get('/api/user/deleteFollow/:id', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId as string
    const forceUnfollowId = req.params?.id as string
    let success = false
    try {
      let follow = await Follows.findOne({
        where: {
          followerId: forceUnfollowId,
          followedId: userId
        }
      })
      if (follow) {
        if (follow.remoteFollowId) {
          await rejectremoteFollow(userId, forceUnfollowId)
        }
        await redisCache.del('follows:local:' + forceUnfollowId)
        await redisCache.del('follows:full:' + forceUnfollowId)
        await redisCache.del('follows:local:' + userId)
        await redisCache.del('follows:full:' + userId)
        await follow.destroy()
        success = true
      }
    } catch (error) {
      logger.debug({
        message: `Remote force unfollow failed`,
        error: error
      })
      success = false
      res.status(500)
    }
    res.send({ success: success })
  })

  app.get('/api/user/approveFollow/:id', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId as string
    const approvedFollower = req.params?.id as string
    let success = true
    try {
      let follow = await Follows.findOne({
        where: {
          followerId: approvedFollower,
          followedId: userId
        }
      })
      if (follow) {
        if (follow.remoteFollowId) {
          await acceptRemoteFollow(userId, approvedFollower)
        }
        follow.accepted = true
        await follow.save()
        await redisCache.del('follows:local:' + approvedFollower)
        await redisCache.del('follows:full:' + approvedFollower)
        await redisCache.del('follows:local:' + userId)
        await redisCache.del('follows:full:' + userId)
      }
    } catch (error) {
      logger.debug({
        message: `Accept follow failed`,
        error: error
      })
      success = false
      res.status(500)
    }
    res.send({ success: success })
  })

  app.get('/api/user/:url/follows', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const url = req.params?.url as string
    const followers = req.query?.followers === 'true'
    if (url) {
      const user = await User.findOne({
        where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase())
      })
      if (user) {
        let responseData
        if (!followers) {
          responseData = await user.getFollower({
            where: {
              '$follows.accepted$': {
                [Op.in]: req.jwtData?.userId === user.id ? [true, false] : [true]
              }
            },
            attributes: ['id', 'url', 'avatar', 'description']
          })
        } else {
          // who :url is following
          responseData = await user.getFollowed({
            where: {
              '$follows.accepted$': {
                [Op.in]: req.jwtData?.userId === user.id ? [true, false] : [true]
              }
            },
            attributes: ['id', 'url', 'avatar', 'description']
          })
        }
        if (user.hideFollows && user.url != req.jwtData?.url) {
          res.send([])
        } else {
          res.send(responseData)
        }
      } else {
        res.sendStatus(404)
      }
    } else {
      res.sendStatus(404)
    }
  })

  app.get('/api/user/myAsks', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId as string
    const asks = await Ask.findAll({
      attributes: ['userAsker', 'question', 'apObject', 'id', 'createdAt', 'postId'],
      where: {
        userAsked: userId,
        answered: req.query.answered === 'true'
      },
      order: [['createdAt', 'DESC']]
    })
    const users = await User.findAll({
      attributes: ['url', 'avatar', 'name', 'id', 'description'],
      where: {
        id: {
          [Op.in]: asks.map((ask: any) => ask.userAsker)
        }
      }
    })
    res.send({
      asks: asks,
      users: users
    })
  })

  app.post('/api/user/:url/ask', optionalAuthentication, async (req: AuthorizedRequest, res: Response) => {
    // a bit dirty innit
    if (req.body.anonymous) {
      req.jwtData = undefined
    }
    if (req.body.question) {
      if (
        slurs.includes(req.body.question.toLowerCase()) ||
        req.body.question.toLowerCase().includes('kill yourself')
      ) {
        res.status(400)
        return res.send({
          error: true,
          message: 'Your ask seems to be harmful. Fuck you.'
        })
      }
    }
    const lastHourAsks = await Ask.count({
      where: {
        creationIp: getIp(req),
        createdAt: {
          [Op.gt]: new Date().setHours(new Date().getHours() - 1)
        }
      }
    })
    // a bit dirty of a way but yeah limit asks if user is not logged in. if user is logged in we can ban them later
    if (lastHourAsks >= 5 && !req.jwtData?.userId) {
      return res.sendStatus(429)
    }
    const url = req.params?.url as string
    const userRecivingAsk = await User.scope('full').findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase())
    })
    if (!userRecivingAsk) {
      res.sendStatus(500)
      logger.warn({
        message: `Ask invalid user: ${url}`
      })
      return
    }
    const userAskLevelDBOption = await UserOptions.findOne({
      where: {
        userId: userRecivingAsk.id,
        optionName: 'wafrn.public.asks'
      }
    })
    const userAskLevel = userAskLevelDBOption ? parseInt(userAskLevelDBOption.optionValue) : 2
    //
    if ((!req.jwtData?.userId && userAskLevel === 1) || (req.jwtData?.userId && [1, 2].includes(userAskLevel))) {
      // user can recive an ask from this endpoint
      const userAsking = req.jwtData?.userId
      if (userAsking === userRecivingAsk.id) {
        return res.send({
          success: false
        })
      }

      if (userAsking) {
        const blocksExisting = await Blocks.count({
          where: {
            [Op.or]: [
              {
                blockerId: userAsking,
                blockedId: userRecivingAsk.id
              },
              {
                blockerId: userRecivingAsk.id,
                blockedId: userAsking
              }
            ]
          }
        })
        if (blocksExisting > 0) {
          return res.send({
            success: false
          })
        }
      }

      const question = req.body.question ? req.body.question.substring(0, 10240) : ''
      await Ask.create({
        question: dompurify.sanitize(question, { ALLOWED_TAGS: [] }),
        apObject: null,
        creationIp: getIp(req),
        answered: false,
        userAsked: userRecivingAsk.id,
        userAsker: userAsking
      })
      res.send({
        success: true
      })
    } else {
      // user can not recive an ask here so we say nope.avi
      res.send({
        success: false
      })
    }
  })

  app.post('/api/user/ignoreAsk', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const askToIgnore = await Ask.findOne({
      where: {
        userAsked: req.jwtData?.userId as string,
        id: req.body.id
      }
    })
    res.send({
      success: askToIgnore ? true : false
    })
    if (askToIgnore) {
      askToIgnore.answered = true
      await askToIgnore.save()
    }
  })

  app.post('/api/user/bookmarkPost', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    try {
      if (req.body.postId) {
        const userId = req.jwtData?.userId as string
        const postId = req.body.postId
        await UserBookmarkedPosts.findOrCreate({
          where: {
            postId: postId,
            userId: userId
          }
        })
        success = true
      }
    } catch (error) {
      logger.info({
        message: `Error creating bookmark of post`,
        error: error
      })
    }

    res.send({
      success: success
    })
  })

  app.post('/api/user/unbookmarkPost', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    try {
      if (req.body.postId) {
        const userId = req.jwtData?.userId as string
        const postId = req.body.postId
        await UserBookmarkedPosts.destroy({
          where: {
            postId: postId,
            userId: userId
          }
        })
        success = true
      }
    } catch (error) {
      logger.info({
        message: `Error deleting bookmark of post`,
        error: error
      })
    }

    res.send({
      success: success
    })
  })

  // lazy I know. if post is already pinned, we unpin
  app.post('/api/user/pinPost', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    try {
      const userId = req.jwtData?.userId as string
      const postId = req.body.postId
      const user = (await User.findByPk(userId)) as User
      if (postId) {
        const postToPin = await Post.findOne({
          where: {
            id: postId,
            userId: userId,
            isReblog: false
          }
        })
        if (postToPin && !postToPin.featured) {
          const transaction = await sequelize.transaction()
          try {
            // unpin any other post by this user before pinning the new one
            const pinnedPosts = await Post.findAll({
              where: {
                userId: userId,
                featured: { [Op.ne]: null }
              },
              transaction
            })
            // less efficient, but we send unpin to every alredy pinned post to fedi to make sure we only allow one pinned post
            for await (const post of pinnedPosts) {
              await pinPost(post, true)
              post.featured = null
              await post.save()
            }
            postToPin.featured = new Date()
            await postToPin.save({ transaction })
            await transaction.commit()
            success = true
          } catch (error) {
            await transaction.rollback()
            throw error
          }
          // clear cache
          await redisCache.del('localUserData:' + user.url.toLowerCase())
          await redisCache.del('featuredCollection:' + user.id)
          await pinPost(postToPin)

          if (completeEnvironment.enableBsky && postToPin.bskyUri && postToPin.bskyCid) {
            const user = await User.scope('full').findByPk(userId)
            if (user?.enableBsky && user.bskyDid) {
              const bskySession = await getAtProtoSession(user)
              await pinPostOnBluesky(bskySession, postToPin.bskyUri, postToPin.bskyCid)
            }
          }
        } else if (postToPin) {
          // we unpin!
          postToPin.featured = null
          await postToPin.save()

          // we clear cache
          await redisCache.del('localUserData:' + user.url.toLowerCase())
          await redisCache.del('featuredCollection:' + user.id)
          if (completeEnvironment.enableBsky) {
            const user = await User.scope('full').findByPk(userId)
            if (user?.enableBsky && user.bskyDid) {
              const bskySession = await getAtProtoSession(user)
              await pinPostOnBluesky(bskySession, '', '')
            }
          }
          await pinPost(postToPin, true)
          success = true
        }
      }
    } catch (error) {
      logger.info({
        message: `Error pinning post`,
        error: error
      })
    }

    res.send({
      success: success
    })
  })

  // TODO still not finished
  app.post('/api/user/migrateOut', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    const newUserRemoteId: string = req.body.target
    const localUser = await User.scope('full').findByPk(req.jwtData?.userId)
    let result = {
      message: `No remote user found ${newUserRemoteId}`,
      success: false
    }
    const newRemoteUser = await getRemoteActor(newUserRemoteId, await getAdminUser())
    if (newUserRemoteId && localUser && newRemoteUser) {
      result = await migrateUserFedi(localUser, newRemoteUser)
    }

    res.status(result.success ? 200 : 500)
    res.send({
      success,
      message: result.message
    })
  })
}

async function updateProfileOptions(optionsJSON: string, posterId: string) {
  const _options = JSON.parse(optionsJSON)
  if (Array.isArray(_options)) {
    const options = _options
      .filter((elem) => elem.name)
      .map((opt) => {
        return {
          ...opt,
          // NOTE: opt.value should be a string result of JSON.stringify, adding this to prevent any potential security issues
          value: String(opt.value),
          public: opt.name.startsWith('wafrn.public') || opt.name.startsWith('fediverse.public')
        }
      })
    const optionNames = options.map((elem) => elem.name)
    const transaction = await sequelize.transaction()
    try {
      await UserOptions.destroy({
        where: {
          userId: posterId,
          optionName: {
            [Op.in]: optionNames
          }
        },
        transaction: transaction
      })
      await UserOptions.bulkCreate(
        options.map((elem) => {
          return {
            userId: posterId,
            optionName: elem.name,
            optionValue: elem.value,
            public: elem.public == true
          }
        }),
        {
          transaction: transaction
        }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      logger.info({ message: `Problem updating user otpions`, error: error })
    }
  }
}

export { userRoutes }
