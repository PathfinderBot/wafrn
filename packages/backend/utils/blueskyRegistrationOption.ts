import { AtpAgent } from '@atproto/api'
import { User, UserOptions } from '../models/index.js'
import { completeEnvironment } from './backendOptions.js'
import generateRandomString from './generateRandomString.js'
import { logger } from './logger.js'
import {
  createBskyAccount,
  createBskyAppPassword,
  createBskyInviteCode,
  serviceUrl,
  updateBlueskyProfile
} from '../services/bskyAccount.js'

const BLUESKY_REGISTRATION_OPTION_NAME = 'wafrn.blueskyRegistrationOption'

enum BlueskyRegistrationOption {
  NoThanks = 0,
  CreateNew = 1,
  BringOwn = 2
}
async function applyBlueskyRegistrationOption(user: User): Promise<string> {
  const savedOption = await UserOptions.findOne({
    where: { userId: user.id, optionName: BLUESKY_REGISTRATION_OPTION_NAME }
  })

  if (!savedOption) {
    return ''
  }

  const option = parseInt(savedOption.optionValue, 10)
  await savedOption.destroy()

  if (option === BlueskyRegistrationOption.CreateNew) {
    if (!completeEnvironment.enableBsky) {
      return `\
<p>You asked us to create a Bluesky account for you, but this instance does not have Bluesky enabled. \
You can create or link one later from your settings.</p>`
    }
    try {
      const inviteCode = await createBskyInviteCode()
      const agent = new AtpAgent({ service: serviceUrl })
      const password = generateRandomString()
      await createBskyAccount({ agent, user, password, inviteCode })
      await createBskyAppPassword(user, agent)
      await updateBlueskyProfile(agent, user)
      return `\
<p>As requested, we have created a Bluesky account for you! Since we generated a random password for it that we \
did not keep, you will need to <a href="${completeEnvironment.frontendUrl}/profile/enable-bluesky">sync your Bluesky account</a> \
to be able to access the Bluesky appview.</p>`
    } catch (error) {
      logger.error({
        message: `Error auto-creating bluesky account for ${user.url} on activation`,
        error
      })
      return `\
<p>Unfortunately, we were unable to create a Bluesky account for you automatically. Sorry about that! You can try \
creating or linking one later from settings.</p>`
    }
  }

  if (option === BlueskyRegistrationOption.BringOwn) {
    return `\
<p>You told us you will bring your own Bluesky account later. Whenever you are ready, follow \
<a href="https://wafrn.net/faq/AccountMigration.html#atproto-waf">these instructions</a> to migrate it to your \
${completeEnvironment.instanceUrl} account.</p>`
  }

  return ''
}

export { applyBlueskyRegistrationOption, BlueskyRegistrationOption, BLUESKY_REGISTRATION_OPTION_NAME }
