import { Jetstream } from "@skyware/jetstream";
import { Job, Queue, Worker } from "bullmq";
import { checkCommitMentions } from "./atproto/utils/checkCommitMentions.js";
import { logger } from "./utils/logger.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import { redisCache } from "./utils/redis.js";
import { forceUpdateDidsCacheQueue } from "./interfaces/atproto/forceUpdateDidsCacheUpdate.js";
import { FOLLOWED_BSKY_DIDS_CACHE_KEY, FOLLOWED_HASHTAGS_CACHE_KEY, LOCAL_USER_DIDS_CACHE_KEY } from "./constants.js";
import { forcePopulateCache } from "./atproto/cache/forcePopulateCache.js";

//const firehose = new Firehose(`wss://bolson.bsky.dev`);

const cursorCache = await redisCache.get("jetstreamCursor");
let cursor = new Date().getTime();
if (cursorCache) {
  try {
    cursor = new Date(cursorCache).getTime();
  } catch (error) {
    logger.warn({
      message: `Error starting the jetstream`,
      error: error
    })
  }
}

const cacheLoaded = await redisCache.exists(LOCAL_USER_DIDS_CACHE_KEY)
if(!cacheLoaded) {
  await forcePopulateCache()
}
const jetstream = new Jetstream({
  endpoint: completeEnvironment.bskyJetstreamUrl,
  wantedCollections: [
    "net.wafrn.feed.bite",
    "app.bsky.feed.like",
    "app.bsky.feed.post",
    "app.bsky.feed.repost",
    "app.bsky.graph.follow",
    "app.bsky.graph.block",
    "app.bsky.feed.threadgate",
  ],
  // wantedDids: [
  //   'did:plc:zmgp4bhcck7kdxs5og7qo5rm'
  // ],
  cursor: cursor,
});

const firehoseQueue = new Queue("firehoseQueue", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 2,
    removeOnFail: true,
  },
});

const lowPriorityFirehoseQueue = new Queue("lowPriorityFirehoseQueue", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 2,
    removeOnFail: true,
  },
});

jetstream.on("commit", async (event) => {
  const commit = event.commit;

  if (
    await checkCommitMentions(event.did, commit)
  ) {
    await redisCache.set("jetstreamCursor", event.time_us);
    const data = {
      repo: event.did,
      operation: {
        ...(commit as any),
        action: commit.operation,
        collection: commit.collection,
        path: `${commit.collection}/${commit.rkey}`,
      },
    };
    if(commit.operation === 'delete' || ['app.bsky.graph.follow', 'app.bsky.feed.like'].includes(commit.collection)) {
      await lowPriorityFirehoseQueue.add("lowPriorityFirehoseQueue", data)
    } else {
      await firehoseQueue.add("processFirehoseQueue", data);
    }
  }
});

jetstream.on("close", async () => {
  logger.warn("jetstream closed");
  const timeClosing = new Date().getTime();
  await redisCache.set("jetstreamCursor", timeClosing);
  throw new Error("Jetstream closed. Forcing restart");
});

jetstream.start();

const workerForceUpdateAtDidCache = new Worker(
  "forceUpdateDids",
  async (job: Job) => {
    const data = job.data as forceUpdateDidsCacheQueue;
    if(data?.addFollowedDid) {
      await redisCache.sadd(FOLLOWED_BSKY_DIDS_CACHE_KEY, data.addFollowedDid)
    }
    if(data?.addLocalUserDid) {
      await redisCache.sadd(LOCAL_USER_DIDS_CACHE_KEY, data.addLocalUserDid)
    }
    if(data?.addFollowedHashtag) {
      await redisCache.sadd(FOLLOWED_HASHTAGS_CACHE_KEY, data.addFollowedHashtag.toLowerCase().trim())
    }
  },
  {
    connection: completeEnvironment.bullmqConnection,
    concurrency: 1,
    lockDuration: 120000,
  }
);

workerForceUpdateAtDidCache.on("failed", (err) => {
  logger.warn({
    message: `workerforceUpdateDids failed`,
    error: err,
  });
});

logger.info("started atproto");
