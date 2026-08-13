import { Op } from 'sequelize'
import { forcePopulateUsers } from './getAtprotoUser.js'
import { Follows, User } from '../../models/index.js'
import { getAdminUser } from '../../utils/getAdminAndDeletedUser.js'
import { getAdminAtprotoSession } from './getAdminAtprotoSession.js'
import { processSinglePost } from './getAtProtoThread.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { Queue } from 'bullmq'

export type syncBskyDataPayload = {
  userId: string
}

const syncBskyFollowsQueue = new Queue<syncBskyDataPayload, void>('syncBskyFollows', {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1
  }
})

const syncBskyPostsQueue = new Queue<syncBskyDataPayload, void>('syncBskyPosts', {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1
  }
})

async function syncBskyAccountData(userId: string, options: { syncPosts: boolean; syncFollows: boolean }) {
  const user = await User.findByPk(userId)
  if (user && user.bskyDid) {
    if (options.syncFollows) {
      await syncBskyFollowsQueue.add('syncBskyFollows', { userId: userId })
    }
    if (options.syncPosts) {
      await syncBskyPostsQueue.add('syncBskyPosts', { userId: userId })
    }
  }
}

export { syncBskyAccountData }
