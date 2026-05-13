import { Job, MetricsTime, Worker } from 'bullmq'
import { inboxWorker } from './queueProcessors/inbox.js'
import { prepareSendRemotePostWorker } from './queueProcessors/prepareSendRemotePost.js'
import { sendPostToInboxes } from './queueProcessors/sendPostToInboxes.js'
import { getRemoteActorIdProcessor } from './queueProcessors/getRemoteActorIdProcessor.js'
import { logger } from './logger.js'
import { processRemotePostView } from './queueProcessors/processRemotePostView.js'
import { processRemoteMedia } from './queueProcessors/remoteMediaProcessor.js'
import { processFirehose } from '../atproto/workers/processFirehoseWorker.js'
import { sendPushNotification } from './queueProcessors/sendPushNotification.js'
import { checkPushNotificationDelivery } from './queueProcessors/checkPushNotificationDelivery.js'
import { generateUserKeyPair } from './queueProcessors/generateUserKeyPair.js'
import { completeEnvironment } from './backendOptions.js'
import { sendPostBsky } from './queueProcessors/sendPostBsky.js'
import { processSinglePostJob } from '../atproto/workers/processSinglePostWorker.js'
import { follow } from './follow.js'
import { mergeUser } from './queueProcessors/mergeUser.js'
import { mergePost } from './queueProcessors/mergePost.js'
import { fetchFediThread } from './queueProcessors/fetchFediThread.js'
import { downloadMedia } from './queueProcessors/downloadMedia.js'
import { syncBskyFollowsJob } from './queueProcessors/syncBskyFollows.js'
import { syncBskyPosts } from './queueProcessors/syncBskyPosts.js'

logger.info('started worker')
const workerInbox = new Worker('inbox', (job: Job) => inboxWorker(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high
})

const workerPrepareSendPost = new Worker('prepareSendPost', (job: Job) => prepareSendRemotePostWorker(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
  lockDuration: 60000
})

const workerSendPostBsky = new Worker('sendPostBsky', (job: Job) => sendPostBsky(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
  lockDuration: 60000
})

const workerSendPostChunk = new Worker('sendPostToInboxes', (job: Job) => sendPostToInboxes(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
  lockDuration: 120000
})

const workerMergeUsers = new Worker('mergeUsers', (job: Job) => mergeUser(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.low
})

const workerMergePost = new Worker('mergePosts', (job: Job) => mergePost(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.low,
  lockDuration: 120000
})

const workerFollow = new Worker('doFollow', (job: Job) => follow(job.data.followerId, job.data.followedId), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.low,
  lockDuration: 120000
})

const workerDeletePost = new Worker('deletePostQueue', (job: Job) => sendPostToInboxes(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
  lockDuration: 120000
})

const workerGetUser = new Worker('getRemoteActorId', async (job: Job) => await getRemoteActorIdProcessor(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
  lockDuration: 120000
})

const workerProcessRemotePostView = new Worker(
  'processRemoteView',
  async (job: Job) => await processRemotePostView(job),
  {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.low,
    lockDuration: 120000
  }
)

const workerProcessRemoteMediaData = new Worker(
  'processRemoteMediaData',
  async (job: Job) => await processRemoteMedia(job),
  {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.low,
    lockDuration: 120000
  }
)

const workerProcessFirehose = completeEnvironment.enableBsky
  ? new Worker('firehoseQueue', async (job: Job) => await processFirehose(job), {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.high,
  })
  : null


const lowPriorityFirehoseQueue = completeEnvironment.enableBsky
  ? new Worker('lowPriorityFirehoseQueue', async (job: Job) => await processFirehose(job), {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.medium,
  })
  : null

const workerProcessSinglePost = completeEnvironment.enableBsky
  ? new Worker('processSinglePost', async (job: Job) => await processSinglePostJob(job), {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.high,
    // up to one minute
    lockDuration: 60000
  })
  : null

const workerFetchFediTrhead = new Worker('processSinglePost', async (job: Job) => await fetchFediThread(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.high,
})

const workerSendPushNotification = new Worker(
  'sendPushNotification',
  async (job: Job) => await sendPushNotification(job),
  {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.medium
  }
)

const workerCheckPushNotificationDelivery = new Worker(
  'checkPushNotificationDelivery',
  async (job: Job) => await checkPushNotificationDelivery(job),
  {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: completeEnvironment.workers.medium
  }
)

const workerGenerateUserKeyPair = new Worker(
  'generateUserKeyPair',
  async (job: Job) => await generateUserKeyPair(job),
  {
    connection: completeEnvironment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: 1 // this one is VERY cpu intensive
  }
)

const workerDownloadMedia = new Worker('downloadMedia', async (job: Job) => await downloadMedia(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: 0
  },
  concurrency: completeEnvironment.workers.high * 5, // EXTREMELY HiGH
  // ten seconds
  lockDuration: 10000
})

const workerSyncBskyFollows = new Worker('syncBskyFollows', (job: Job) => syncBskyFollowsJob(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.low,
})

const workerSyncBskyPosts = new Worker('syncBskyPosts', (job: Job) => syncBskyPosts(job), {
  connection: completeEnvironment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: completeEnvironment.workers.low,
})

const workers = [
  workerInbox,
  workerDeletePost,
  workerGetUser,
  workerPrepareSendPost,
  workerProcessRemotePostView,
  workerSendPostChunk,
  workerProcessRemotePostView,
  workerProcessRemoteMediaData,
  workerSendPushNotification,
  workerCheckPushNotificationDelivery,
  workerGenerateUserKeyPair,
  workerFollow,
  workerMergeUsers,
  workerMergePost,
  workerFetchFediTrhead,
  workerDownloadMedia,
  workerSyncBskyFollows,
  workerSyncBskyPosts
]
if (completeEnvironment.enableBsky) {
  workers.push(workerProcessFirehose as Worker)
  workers.push(workerProcessSinglePost as Worker)
  workers.push(workerSendPostBsky as Worker)
  workers.push(lowPriorityFirehoseQueue as Worker)
}

workers.forEach((worker) => {
  worker.on('error', (err) => {
    logger.warn({
      message: `worker ${worker.name} had error`,
      error: err
    })
  })
  worker.on('failed', (err) => {
    logger.warn({
      message: `worker ${worker.name} failed`,
      error: err
    })
  })
})

const workersToLogFail = [
  workerInbox,
  workerDeletePost,
  workerGetUser,
  workerPrepareSendPost,
  workerProcessRemotePostView,
  workerSendPostChunk,
  workerSendPushNotification,
  workerGenerateUserKeyPair,
  workerFollow,
  workerMergeUsers,
  workerMergePost,
  workerSyncBskyFollows,
  workerSyncBskyPosts
]
if (completeEnvironment.enableBsky) {
  workersToLogFail.push(workerProcessFirehose as Worker)
  workersToLogFail.push(workerProcessSinglePost as Worker)
  workersToLogFail.push(workerSendPostBsky as Worker)
  workersToLogFail.push(lowPriorityFirehoseQueue as Worker)
}

workersToLogFail.forEach((worker) =>
  worker.on('failed', (err) => {
    logger.warn({
      message: `worker ${worker.name} failed`,
      error: err
    })
  })
)

export {
  workerInbox,
  workerSendPostChunk,
  workerPrepareSendPost,
  workerGetUser,
  workerDeletePost,
  workerProcessRemotePostView,
  workerProcessRemoteMediaData,
  workerProcessFirehose,
  workerProcessSinglePost,
  workerSendPushNotification,
  workerCheckPushNotificationDelivery,
  workerGenerateUserKeyPair,
  workerSendPostBsky,
  workerMergeUsers,
  workerMergePost,
  workerFetchFediTrhead,
  workerDownloadMedia,
  workerSyncBskyFollows,
  workerSyncBskyPosts,
  lowPriorityFirehoseQueue
}


// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    logger.info(`Closing ${workers.length} workers...`);
    await Promise.all(
      workers.map(async (worker) => {
        try {
          logger.debug(`Closing worker: ${worker.name}`);
          await worker.close();
          logger.debug(`Worker closed: ${worker.name}`);
        } catch (error) {
          logger.warn({
            message: `Error closing worker ${worker.name}`,
            error,
          });
        }
      })
    );
    logger.info("All workers closed successfully");
    process.exit(0);
  } catch (error) {
    logger.error({
      message: "Error during graceful shutdown",
      error,
    });
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));