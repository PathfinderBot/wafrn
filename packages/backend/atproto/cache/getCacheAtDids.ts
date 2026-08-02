// TODO: Rename this file
import { getQueue } from '../../utils/queues.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { forceUpdateDidsCacheQueue } from '../../interfaces/atproto/forceUpdateDidsCacheUpdate.js'

async function forceUpdateCacheDidsAtThread(data: forceUpdateDidsCacheQueue) {
  const forceUpdaDidsteQueue = getQueue('forceUpdateDids')
  await forceUpdaDidsteQueue.add('forceUpdateDids', data)
}

export { forceUpdateCacheDidsAtThread }
