import { Queue } from 'bullmq'
import { Migration } from '../migrate.js'
import { completeEnvironment } from '../utils/backendOptions.js'

export const up: Migration = async (params) => {
  const getRemoteActorQueue = new Queue('getRemoteActorId', {
    connection: completeEnvironment.bullmqConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1
    }
  })
  await getRemoteActorQueue.obliterate({ force: true })
}

export const down: Migration = async (params) => {}
