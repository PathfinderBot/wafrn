import { AtpAgent } from '@atproto/api'
import { getAtProtoSession } from './getAtProtoSession.js'
import { getAdminUser } from '../../utils/getAdminAndDeletedUser.js'
import { logger } from '../../utils/logger.js'

let adminSession: AtpAgent | undefined
let lastTimeSessionCreated = new Date(0)

async function getAdminAtprotoSession(): Promise<AtpAgent> {
  const currentDate = new Date()
  if (!adminSession || currentDate.getTime() - lastTimeSessionCreated.getTime() >= 300000) {
    adminSession = await getAtProtoSession(await getAdminUser(), true)
    lastTimeSessionCreated = new Date()
    logger.info('Force getting new admin bsky session')
  }
  return adminSession
}

export { getAdminAtprotoSession }
