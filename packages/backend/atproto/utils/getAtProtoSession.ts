import { AtpAgent } from '@atproto/api'
import { User } from '../../models/index.js'
import { redisCache } from '../../utils/redis.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { logger } from '../../utils/logger.js'
import { getAdminAtprotoSession } from '../../utils/atproto/getAdminAtprotoSession.js'
import handleAgentLoginFail from './handleAgentLoginFail.js'
import { wait } from '../../utils/wait.js'

async function getAtProtoSession(userInput?: User, force?: boolean): Promise<AtpAgent> {
  /*
    This is a dirty solution, but we want to retry multiple times before saying "fuck off"
    and disabling bsky for the user!
    Also there is a posibility multiple tries happen at the same time so we should to account for 
    the posibility of the password disapearing mid update. At this moment we are NOT gona test for that!
  */
  let res: AtpAgent = await getAtProtoSessionInternal(userInput, force)
  if (res.did) {
    return res
  } else {
    await wait(1000)
    res = await getAtProtoSessionInternal(userInput, true)
    if (res.did) {
      return res
    } else {
      await wait(2500)
      res = await getAtProtoSessionInternal(userInput, true)
      if (!res.did && userInput) {
        await handleAgentLoginFail(userInput)
      }
      return res
    }
  }
}

async function getAtProtoSessionInternal(userInput?: User, force?: boolean): Promise<AtpAgent> {
  let user = userInput ? ((await User.scope('full').findByPk(userInput.id)) as User) : undefined
  if (true && force && user) {
    await redisCache.del('bskySession:' + user.id)
  }
  if (!force && user && user.url === completeEnvironment.adminUser) {
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
    const existingSession = force ? null : await redisCache.get('bskySession:' + user.id)
    let loggedIn = false
    if (existingSession) {
      const { success } = await agent.sessionManager.resumeSession(JSON.parse(existingSession))
      loggedIn = success
    }
    try {
      if (!loggedIn) {
        await redisCache.del('bskySession:' + user.id)
        if (!user.bskyDid) {
          throw new Error(`Cannot log in without a bskyDid on user: ${user.url}`)
        }
        if (!user.bskyAppPassword) {
          throw new Error(`Cannot log in without a bskyAppPassword on user: ${user.url}`)
        }

        await agent.sessionManager.login({
          identifier: user.bskyDid,
          password: user.bskyAppPassword
        })
      }
    } catch (error) {
      logger.error({
        message: `Error logging in with bsky user ${user.url}`,
        user: user.url,
        error: error
      })
      if (user.url !== completeEnvironment.adminUser) {
        await handleAgentLoginFail(user)
      }
    }
  }
  return agent
}

export { getAtProtoSession }
