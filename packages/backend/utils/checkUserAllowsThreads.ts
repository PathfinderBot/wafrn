import { SignedRequest } from '../interfaces/fediverse/signedRequest.js'
import { getUserOptions } from './cacheGetters/getUserOptions.js'
import { completeEnvironment } from './backendOptions.js'

async function checkuserAllowsThreads(req: SignedRequest, user: any) {
  if (req.fediData && req.fediData.fediHost && req.fediData.fediHost.includes('threads.net')) {
    const resolvedUser = await user
    // The instance admin opting the instance into Threads federation counts as their own opt-in too,
    // regardless of whether they also flipped their personal wafrn.federateWithThreads option.
    if (completeEnvironment.enableOptInFederationToThreads && resolvedUser?.url === completeEnvironment.adminUser) {
      return true
    }
    const options = await getUserOptions(resolvedUser.id)
    const userFederatesWithThreads = options.filter(
      (elem) => elem.optionName === 'wafrn.federateWithThreads' && elem.optionValue === 'true'
    )
    return userFederatesWithThreads.length > 0
  } else {
    return true
  }
}

export { checkuserAllowsThreads }
