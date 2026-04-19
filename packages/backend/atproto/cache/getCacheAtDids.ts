// TODO: Rename this file
import { Queue } from 'bullmq'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { forceUpdateDidsCacheQueue } from '../../interfaces/atproto/forceUpdateDidsCacheUpdate.js'


async function forceUpdateCacheDidsAtThread(data: forceUpdateDidsCacheQueue) {
  const forceUpdaDidsteQueue = new Queue('forceUpdateDids', {
    connection: completeEnvironment.bullmqConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  })
  await forceUpdaDidsteQueue.add('forceUpdateDids', data)
}

export { forceUpdateCacheDidsAtThread }
