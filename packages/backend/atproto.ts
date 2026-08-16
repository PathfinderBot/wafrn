import { Jetstream } from '@skyware/jetstream'
import { Job, Queue, Worker } from 'bullmq'
import { checkCommitMentions } from './atproto/utils/checkCommitMentions.js'
import { logger } from './utils/logger.js'
import { completeEnvironment } from './utils/backendOptions.js'
import { redisCache } from './utils/redis.js'
import { forceUpdateDidsCacheQueue } from './interfaces/atproto/forceUpdateDidsCacheUpdate.js'
import { FOLLOWED_BSKY_DIDS_CACHE_KEY, FOLLOWED_HASHTAGS_CACHE_KEY, LOCAL_USER_DIDS_CACHE_KEY } from './constants.js'
import { forcePopulateCache } from './atproto/cache/forcePopulateCache.js'
import { getQueue } from './utils/queues.js'
import { getAtprotoUser } from './atproto/utils/getAtprotoUser.js'

//const firehose = new Firehose(`wss://bolson.bsky.dev`);

const cursorCache = await redisCache.get('jetstreamCursor')
let cursor = new Date().getTime()
if (cursorCache) {
  try {
    cursor = new Date(cursorCache).getTime()
  } catch (error) {
    logger.warn({
      message: `Error starting the jetstream`,
      error: error
    })
  }
}

const cacheLoaded = await redisCache.exists(LOCAL_USER_DIDS_CACHE_KEY)
if (!cacheLoaded) {
  await forcePopulateCache()
}
const cacheLastForceUpdate = (await redisCache.get('bskyCacheDate')) ?? '0'
// every four weeks force update dids
if (new Date().getTime() - parseInt(cacheLastForceUpdate) > 3600 * 24 * 28 * 1000) {
  logger.info({
    message: `UPDATING LOCAL CACHE OF USERS. This may take a few minutes depending on your isntance`
  })
  await forcePopulateCache()
  logger.info({
    message: `Updated local users cache`
  })
}
const jetstream = new Jetstream({
  endpoint: completeEnvironment.bskyJetstreamUrl,
  wantedCollections: [
    'net.wafrn.feed.bite',
    'app.bsky.feed.like',
    'app.bsky.feed.post',
    'app.bsky.feed.repost',
    'app.bsky.graph.follow',
    'app.bsky.graph.block',
    'app.bsky.feed.threadgate'
  ],
  // wantedDids: [
  //   'did:plc:zmgp4bhcck7kdxs5og7qo5rm'
  // ],
  cursor: cursor
})

const firehoseQueue = getQueue('firehoseQueue')

const lowPriorityFirehoseQueue = getQueue('lowPriorityFirehoseQueue')

async function persistCursor(timeUs: number | undefined) {
  if (!timeUs) return
  await redisCache.set('jetstreamCursor', timeUs)
}

setInterval(() => {
  void persistCursor(jetstream.cursor)
}, 5000)

const COMMIT_CONCURRENCY = 25
let activeCommits = 0
const commitWaiters: (() => void)[] = []

function acquireCommitSlot(): Promise<void> {
  if (activeCommits < COMMIT_CONCURRENCY) {
    activeCommits++
    return Promise.resolve()
  }
  return new Promise((resolve) => commitWaiters.push(resolve))
}

function releaseCommitSlot() {
  const next = commitWaiters.shift()
  if (next) {
    next()
  } else {
    activeCommits--
  }
}

jetstream.on('commit', async (event) => {
  const commit = event.commit
  await acquireCommitSlot()
  try {
    if (await checkCommitMentions(event.did, commit)) {
      const data = {
        repo: event.did,
        operation: {
          ...(commit as any),
          action: commit.operation,
          collection: commit.collection,
          path: `${commit.collection}/${commit.rkey}`
        }
      }
      if (commit.operation === 'delete' || ['app.bsky.graph.follow', 'app.bsky.feed.like'].includes(commit.collection)) {
        await lowPriorityFirehoseQueue.add('lowPriorityFirehoseQueue', data)
      } else {
        await firehoseQueue.add('processFirehoseQueue', data)
      }
      await persistCursor(event.time_us)
    }
  } catch (error) {
    logger.error({
      message: 'Error processing jetstream commit. Skipping this event.',
      did: event.did,
      collection: commit.collection,
      error
    })
  } finally {
    releaseCommitSlot()
  }
})

// with this we may be able to detect users moving off servers
jetstream.on('identity', async (event) => {
  const didToUpdate = event.identity.did
  if (await redisCache.sismember(FOLLOWED_BSKY_DIDS_CACHE_KEY, didToUpdate)) {
    await getAtprotoUser(didToUpdate, { ignoreCache: true })
  }
})

let reconnectWatchdog: NodeJS.Timeout | null = null

jetstream.on('open', () => {
  if (reconnectWatchdog) {
    clearTimeout(reconnectWatchdog)
    reconnectWatchdog = null
  }
})

jetstream.on('close', () => {
  logger.warn('jetstream closed, waiting for automatic reconnect')
  void persistCursor(jetstream.cursor)
  if (!reconnectWatchdog) {
    reconnectWatchdog = setTimeout(() => {
      logger.error('jetstream did not reconnect in time, forcing restart')
      process.exit(1)
    }, 120000)
  }
})

jetstream.start()

const workerForceUpdateAtDidCache = new Worker(
  'forceUpdateDids',
  async (job: Job) => {
    const data = job.data as forceUpdateDidsCacheQueue
    if (data?.addFollowedDid) {
      await redisCache.sadd(FOLLOWED_BSKY_DIDS_CACHE_KEY, data.addFollowedDid)
    }
    if (data?.addLocalUserDid) {
      await redisCache.sadd(LOCAL_USER_DIDS_CACHE_KEY, data.addLocalUserDid)
    }
    if (data?.addFollowedHashtag) {
      await redisCache.sadd(FOLLOWED_HASHTAGS_CACHE_KEY, data.addFollowedHashtag.toLowerCase().trim())
    }
  },
  {
    connection: completeEnvironment.bullmqConnection,
    concurrency: 1,
    lockDuration: 120000
  }
)

workerForceUpdateAtDidCache.on('failed', (err) => {
  logger.warn({
    message: `workerforceUpdateDids failed`,
    error: err
  })
})

logger.info('started atproto')
