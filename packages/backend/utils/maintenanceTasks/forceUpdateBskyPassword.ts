import { Op } from 'sequelize'
import { User } from '../../models/user.js'
import { completeEnvironment } from '../backendOptions.js'
import { createBskyAppPassword, forceUpdateBskyEmail, updateBskyPassword } from '../../routes/users.js'
import generateRandomString from '../generateRandomString.js'
import { AtpAgent } from '@atproto/api'
import { logger } from '../logger.js'
import { redisCache } from '../redis.js'

async function forceUpdateBskyPassword(user: User) {
  try {
    const serviceUrl = completeEnvironment.bskyPds
      ? completeEnvironment.bskyPds.startsWith('http')
        ? completeEnvironment.bskyPds
        : 'https://' + completeEnvironment.bskyPds
      : ''
    const randomString = generateRandomString()
    await updateBskyPassword(user, randomString)
    logger.debug(
      `New password generated for bluesky user ${user.url}: ${randomString}. Copy this string because it will not be saved to the DB`
    )
    await forceUpdateBskyEmail(user)
    const agent = new AtpAgent({
      service: serviceUrl
    })
    await agent.sessionManager.login({
      identifier: user.bskyDid as string,
      password: randomString
    })
    await createBskyAppPassword(user, agent)
    logger.debug(`New app-password created for bluesky user ${user.url}`)
    await redisCache.del('bskySession:' + user.id)
    return agent
  } catch (error) {
    logger.debug(`Problem updating user bsky password for user: ${user.url}`)
    logger.error(error)
  }
}

const args = process.argv.slice(2)

console.log(args)

const username = args[0]

const user = await User.findOne({
  where: {
    url: {
      [Op.iLike]: username
    }
  }
})

if (!completeEnvironment.enableBsky) {
  throw new Error('This server does not have enableBsky = true in the environment')
}

if (!user) {
  throw new Error(`User "${username}" not found`)
}
if (!user.enableBsky) {
  throw new Error(`User "${username}" does not have enableBsky = true`)
}
if (!user.bskyDid) {
  throw new Error(`User "${username}" does not have bskyDid defined`)
}

let success = await forceUpdateBskyPassword(user)
if (success) {
  console.log('succ ess')
} else {
  console.log('error')
}
