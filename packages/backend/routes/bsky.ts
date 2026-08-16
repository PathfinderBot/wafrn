import { AtpAgent } from '@atproto/api'
import { Application, Response } from 'express'
import { Op } from 'sequelize'
import axios from 'axios'
import bcrypt from 'bcrypt'
import { forceUpdateCacheDidsAtThread } from '../atproto/cache/getCacheAtDids.js'
import { getAtprotoUser } from '../atproto/utils/getAtprotoUser.js'
import { getAdminAtprotoSession } from '../atproto/utils/getAdminAtprotoSession.js'
import { updateUserDidDoc } from '../atproto/utils/updateUserDidDoc.js'
import { followFeed, getMyFeeds, searchFeeds, unfollowFeed, unpinFeed } from '../atproto/utils/bskyFeeds.js'
import { authenticateToken } from '../utils/authenticateToken.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getAllLocalUserIdsSet } from '../utils/cacheGetters/getAllLocalUserIds.js'
import { logger } from '../utils/logger.js'
import { navigationRateLimiter } from '../utils/rateLimiters.js'
import { redisCache } from '../utils/redis.js'
import { syncBskyAccountData } from '../atproto/utils/syncBskyAccountData.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { BskyInviteCodes, Post, sequelize, User } from '../models/index.js'
import {
  createBskyAccount,
  createBskyAppPassword,
  serviceUrl,
  updateBlueskyProfile,
  updateBskyPassword
} from '../services/bskyAccount.js'

async function getUserWithBlueskyEnabled(userId: string): Promise<User | undefined> {
  const user = await User.scope('full').findByPk(userId)
  if (!user || !user.enableBsky || !user.bskyDid) {
    return undefined
  }
  return user
}

function isValidBskyFeedUri(feedUri: unknown): feedUri is string {
  return typeof feedUri === 'string' && /^at:\/\/did:[^/]+\/app\.bsky\.feed\.generator\/.+$/.test(feedUri)
}

function bskyRoutes(app: Application) {
  app.get('/api/fromBluesky/:did', async function (req, res) {
    if (!req.params.did) {
      return res.redirect(completeEnvironment.frontendUrl)
    }

    const cacheUrl = await redisCache.get(`fromBsky:${req.params.did}`)
    if (cacheUrl) return res.redirect(cacheUrl)

    let did = ''
    if (!req.params.did.startsWith('did:') && completeEnvironment.enableBsky) {
      const adminUser = await getAdminAtprotoSession()
      const doc = await adminUser.resolveHandle({
        handle: req.params.did
      })
      if (!doc.success) {
        return res.redirect(completeEnvironment.frontendUrl)
      }
      did = doc.data.did
    }

    const user = await User.findOne({
      where: {
        bskyDid: did
      }
    })

    if (!user) {
      return res.redirect(completeEnvironment.frontendUrl)
    }

    await redisCache.set(`fromBsky:${req.params.did}`, user.fullUrl)
    return res.redirect(user.fullUrl)
  })

  app.post('/api/v2/enable-bluesky', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }

    const password = req.body.password
    const userId = req.jwtData?.userId as string

    let user: User | null = null
    try {
      user = await User.scope('full').findByPk(userId)
    } catch (error) {
      logger.error({
        message: `Error finding current user`,
        error: error
      })
      return res.status(500).send({
        error: true,
        message: `Error finding current user`
      })
    }

    if (!user) {
      return res.status(404).send({
        error: true,
        message: `Current user not found in database`
      })
    }

    // if (user.enableBsky && user.bskyAppPassword && user.bskyDid) {
    //   return res.status(400).send({
    //     error: true,
    //     message: `You already have bluesky enabled`
    //   })
    // }

    if (!password) {
      return res.status(400).send({
        error: true,
        message: `A "password" field is required in the body`
      })
    }

    try {
      // ensure that the received password is the same as the password for the wafrn account of this user.
      const correctPassword = await bcrypt.compare(password, user.password)
      if (!correctPassword) {
        return res.status(400).send({
          error: true,
          message: `Invalid password`
        })
      }

      const agent = new AtpAgent({
        service: serviceUrl
      })

      if (user.bskyDid) {
        // if user has a did, update the bsky password to be the same as the wafrn password and try loggin in with that
        try {
          await updateBskyPassword(user, password)
          await agent.login({
            identifier: user.bskyDid,
            password: password
          })
          await syncBskyAccountData(user.id, { syncPosts: true, syncFollows: true })
        } catch (error) {
          logger.error({
            message: `Failed to update bsky account password for user ${user.url}`,
            error: error
          })
        }
      } else {
        // if user does not have a did, create a new account for them
        const inviteCodeRecord = await BskyInviteCodes.findOne({
          where: {
            masterCode: true
          }
        })
        const inviteCode = inviteCodeRecord?.code

        if (!inviteCode) {
          return res.status(400).send({
            error: true,
            message: `Contact the administrator: no master invite code available`
          })
        }
        await createBskyAccount({
          agent,
          user,
          password,
          inviteCode
        })
      }

      // create an app password for the newly created or updated user.
      const bskyPasswordCreated = await createBskyAppPassword(user, agent)
      if (!bskyPasswordCreated) {
        return res.status(500).send({
          error: true,
          message: `Failed to create app password`
        })
      }
      // now we have to update the profile of the bluesky user coping from the wafrn user profile.
      await updateBlueskyProfile(agent, user)
      res.send({
        success: true,
        did: agent.assertDid
      })
    } catch (error) {
      res.status(500).send({
        error: true,
        message: `There was an error! Contact an admin for this`
      })
      logger.error({
        message: `Error activating bluesky for user ${user.url}`,
        error: error
      })
    }
  })

  app.get('/api/get-bsky-invite-code', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }

    const userId = req.jwtData?.userId as string

    let user: User | null = null
    try {
      user = await User.scope('full').findByPk(userId)
    } catch (error) {
      logger.error({
        message: `Error finding current user`,
        error: error
      })
      return res.status(500).send({
        error: true,
        message: `Error finding current user`
      })
    }

    if (user && user.url === completeEnvironment.adminUser) {
      return res.status(500).send({
        error: true,
        message: `The main admin account is required and nuking its bluesky account will destroy this wafrn instance`
      })
    }

    if (!user) {
      return res.status(404).send({
        error: true,
        message: `Current user not found in database`
      })
    }

    if (user.bskyInviteCode) {
      return res.send({ code: user.bskyInviteCode })
    } else {
      const authString = Buffer.from('admin:' + completeEnvironment.bskyPdsAdminPassword).toString('base64')
      if (user.bskyDid) {
        const deleteAccountReply = await axios.post(
          serviceUrl + '/xrpc/com.atproto.admin.deleteAccount',
          { did: user.bskyDid },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Basic ' + authString
            }
          }
        )
        await redisCache.del(`fromBsky:${user.bskyDid}`)
        user.bskyDid = null
        user.enableBsky = false
        user.alternateUrl = undefined
        user.bskyAppPassword = null
        user.bskyInviteCode = null
        await user.save()
        await redisCache.del('fediverse:user:base:' + user.id)
        await redisCache.del('localUserData:' + user.url.toLowerCase())
      }
      try {
        const inviteCodesReply: { data: { code: string } } = await axios.post(
          serviceUrl + '/xrpc/com.atproto.server.createInviteCode',
          { useCount: 1 },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Basic ' + authString
            }
          }
        )
        user.bskyInviteCode = inviteCodesReply.data.code
        await user.save()
        return res.send({ code: inviteCodesReply.data.code })
      } catch (error) {
        logger.error(error)
        return res.sendStatus(500)
      }
    }
  })

  app.post('/api/connect-bsky-account', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }
    const userId = req.jwtData?.userId as string
    const user = await User.scope('full').findByPk(userId)
    let bskyUrl = req.body.url
    if (bskyUrl.startsWith('@')) {
      bskyUrl = bskyUrl.substring(1)
    }
    const pasword = req.body.password
    if (user && bskyUrl && pasword) {
      const localIds = await getAllLocalUserIdsSet()
      const bskyUser = await getAtprotoUser(bskyUrl, { ignoreCache: true })
      if (bskyUser && bskyUser.url === user.url) {
        return res.send({
          success: true
        })
      }
      if (bskyUser && bskyUser.bskyDid && !localIds.has(bskyUser.id)) {
        const agent = new AtpAgent({
          service: serviceUrl
        })
        try {
          await agent.sessionManager.login({
            identifier: bskyUser.bskyDid as string,
            password: pasword
          })
        } catch (error) {
          res.status(500)
          return res.send({
            success: false,
            error: error
          })
        }

        if (agent.did) {
          // ok now time to update stuff
          // Wrap in a transaction so the DID invalidation + reassignment is done at the exact same time.
          // Without this, the firehose worker can recreate a user with the same DID between the two saves
          const newDid = bskyUser.bskyDid
          const transaction = await sequelize.transaction()
          try {
            // Invalidate the DID on ALL non-local users that have it, not just bskyUser, in case the firehose created new bad records
            await User.update(
              { bskyDid: sequelize.literal(`'INVALID_' || "bskyDid"`) },
              {
                where: {
                  bskyDid: newDid,
                  id: { [Op.ne]: user.id }
                },
                transaction: transaction
              }
            )
            user.bskyDid = newDid
            user.enableBsky = true
            user.bskyAppPassword = pasword
            await user.save({ transaction })
            await Post.update(
              { userId: user.id },
              {
                where: { userId: bskyUser.id },
                transaction
              }
            )
            await transaction.commit()
          } catch (error) {
            await transaction.rollback()
            logger.error({
              message: `Error during bsky account connection for user ${user.url}`,
              error: error
            })
            return res.status(500).send({
              success: false,
              error: 'Failed to connect bluesky account. Please try again.'
            })
          }
          await syncBskyAccountData(user.id, { syncPosts: true, syncFollows: true })
          await forceUpdateCacheDidsAtThread({
            addLocalUserDid: newDid
          })
          await redisCache.del('bskySession:' + user.id)
          await updateUserDidDoc(user)
          return res.send({ success: true })
        }
      } else {
        return res.sendStatus(404)
      }
    }
  })

  // Even tho this is atproto, feeds are given to us by bluesky appview
  // soooo I think the naming bsky is fine
  app.get(
    '/api/v2/bsky/search-feeds',
    authenticateToken,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      if (!completeEnvironment.enableBsky) {
        return res.status(500).send({
          error: true,
          message: `This instance does not have bluesky enabled at this moment`
        })
      }

      const query = req.query.query as string
      if (!query) {
        return res.status(400).send({
          error: true,
          message: `A "query" query param is required`
        })
      }

      const user = await getUserWithBlueskyEnabled(req.jwtData?.userId as string)
      if (!user) {
        return res.status(400).send({
          error: true,
          message: `You need to have bluesky enabled to search for feeds`
        })
      }

      res.send(await searchFeeds(user, query))
    }
  )

  app.get(
    '/api/v2/bsky/my-feeds',
    authenticateToken,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      if (!completeEnvironment.enableBsky) {
        return res.status(500).send({
          error: true,
          message: `This instance does not have bluesky enabled at this moment`
        })
      }

      const user = await getUserWithBlueskyEnabled(req.jwtData?.userId as string)
      if (!user) {
        return res.status(400).send({
          error: true,
          message: `You need to have bluesky enabled to see your feed subscriptions`
        })
      }

      res.send(await getMyFeeds(user))
    }
  )

  app.post('/api/v2/bsky/follow-feed', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }

    const feedUri = req.body?.feedUri as string
    if (!isValidBskyFeedUri(feedUri)) {
      return res.status(400).send({
        error: true,
        message: `A valid "feedUri" field is required in the body`
      })
    }

    const user = await getUserWithBlueskyEnabled(req.jwtData?.userId as string)
    if (!user) {
      return res.status(400).send({
        error: true,
        message: `You need to have bluesky enabled to manage feed subscriptions`
      })
    }

    const success = await followFeed(user, feedUri)
    if (!success) {
      return res.status(500).send({ success: false })
    }
    res.send({ success: true })
  })

  app.post('/api/v2/bsky/unfollow-feed', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }

    const feedUri = req.body?.feedUri as string
    if (!isValidBskyFeedUri(feedUri)) {
      return res.status(400).send({
        error: true,
        message: `A valid "feedUri" field is required in the body`
      })
    }

    const user = await getUserWithBlueskyEnabled(req.jwtData?.userId as string)
    if (!user) {
      return res.status(400).send({
        error: true,
        message: `You need to have bluesky enabled to manage feed subscriptions`
      })
    }

    const success = await unfollowFeed(user, feedUri)
    if (!success) {
      return res.status(500).send({ success: false })
    }
    res.send({ success: true })
  })

  app.post('/api/v2/bsky/unpin-feed', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    if (!completeEnvironment.enableBsky) {
      return res.status(500).send({
        error: true,
        message: `This instance does not have bluesky enabled at this moment`
      })
    }

    const feedUri = req.body?.feedUri as string
    if (!isValidBskyFeedUri(feedUri)) {
      return res.status(400).send({
        error: true,
        message: `A valid "feedUri" field is required in the body`
      })
    }

    const user = await getUserWithBlueskyEnabled(req.jwtData?.userId as string)
    if (!user) {
      return res.status(400).send({
        error: true,
        message: `You need to have bluesky enabled to manage feed subscriptions`
      })
    }

    const success = await unpinFeed(user, feedUri)
    if (!success) {
      return res.status(500).send({ success: false })
    }
    res.send({ success: true })
  })
}

export { bskyRoutes }
