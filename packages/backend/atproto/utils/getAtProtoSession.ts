import { AtpAgent } from '@atproto/api'
import { Notification, Post, PostMentionsUserRelation, User } from '../../models/index.js'
import { redisCache } from '../../utils/redis.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { logger } from '../../utils/logger.js'
import { getAdminAtprotoSession } from '../../utils/atproto/getAdminAtprotoSession.js'
import { forceUpdateBskyPassword } from '../../utils/atproto/updateUserDidDoc.js'
import { getAdminUser } from '../../utils/getAdminAndDeletedUser.js'
import { createNotification } from '../../utils/pushNotifications.js'

async function getAtProtoSession(userInput?: User, force?: boolean): Promise<AtpAgent> {
  let user = userInput ? ((await User.scope('full').findByPk(userInput.id)) as User) : undefined
  if (true && force && user) {
    await redisCache.del('bskySession:' + user.id)
  }
  if (!force && user && user.url == completeEnvironment.adminUser) {
    // a bit dirty innit?
    return await getAdminAtprotoSession()
  }
  const serviceUrl = completeEnvironment.bskyPds.startsWith('http')
    ? completeEnvironment.bskyPds
    : 'https://' + completeEnvironment.bskyPds
  const agent = new AtpAgent({
    service: serviceUrl,
    persistSession: async (evt, session) => {
      if (session && user) {
        // Updated so we do not need to log in on every interaction. Validity is a bit less than 60 seconds so this is safe.
        await redisCache.set('bskySession:' + user.id, JSON.stringify(session), 'EX', 3600)
      }
    }
  })
  if (user) {
    logger.debug({
      message: `Obtaining session for ${user.url}`
    })
    // disabled cache here meanwhile for testing
    const existingSession = force ? null : null // await redisCache.get('bskySession:' + user.id)
    let loggedIn = false
    if (existingSession) {
      loggedIn = (await agent.sessionManager.resumeSession(JSON.parse(existingSession))).success
    }
    try {
      if (!loggedIn) {
        await redisCache.del('bskySession:' + user.id)
        await agent.sessionManager.login({
          identifier: user.bskyDid as string,
          password: (user.bskyAppPassword || user.bskyAuthData) as string
        })
      }
    } catch (error) {
      await redisCache.del('bskySession:' + user.id)
      logger.error({
        message: `Error logging in with bsky user ${user.url}`,
        user: user.url,
        error: error
      })
      const tmpAgent = await forceUpdateBskyPassword(user)
      if(tmpAgent) {
        return tmpAgent
      }
      else {
        const error =  new Error(`Error obtaining bsky session for user ${user.url}`)
        logger.error({
          message: `Error with user bsky session on user ${user.url}`,
          error: error,
          stacktrace: error.stack
        })
      }
    }
  }
  return agent
}

export { getAtProtoSession }
