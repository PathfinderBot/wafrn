import { Firehose } from "@skyware/firehose";
import { Jetstream } from "@skyware/jetstream";
import { getCacheAtDids } from "./atproto/cache/getCacheAtDids.js";
import { Job, Queue, Worker } from "bullmq";
import { checkCommitMentions } from "./atproto/utils/checkCommitMentions.js";
import { logger } from "./utils/logger.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import { redisCache } from "./utils/redis.js";

//const firehose = new Firehose(`wss://bolson.bsky.dev`);

const cursorCache = await redisCache.get("jetstreamCursor");
let cursor = new Date().getTime();
if (cursorCache) {
  try {
    cursor = new Date(cursorCache).getTime();
  } catch (error) {}
}

let cachedDids = await getCacheAtDids(true);
// const firehose = new Firehose({
//   relay: `wss://atproto.africa`
// })

const jetstream = new Jetstream({
  endpoint: "wss://jetstream.fire.hose.cam/subscribe",
  wantedCollections: [
    "net.wafrn.feed.bite",
    "app.bsky.feed.like",
    "app.bsky.feed.post",
    "app.bsky.feed.repost",
    "app.bsky.graph.follow",
    "app.bsky.graph.block",
    "app.bsky.feed.threadgate",
  ],
  cursor: cursor,
});

const firehoseQueue = new Queue("firehoseQueue", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 6,
    backoff: {
      type: "exponential",
      delay: 25000,
    },
    removeOnFail: false,
  },
});

jetstream.on("commit", async (event) => {
  const cacheData = cachedDids;
  const commit = event.commit;

  if (
    cacheData.followedDids.has(event.did) ||
    checkCommitMentions(event.did, commit, cacheData) ||
    commit.collection === "net.wafrn.feed.bite"
  ) {
    await redisCache.set("jetstreamCursor", event.time_us, "EX", 100);
    const data = {
      repo: event.did,
      operation: {
        ...(commit as any),
        action: commit.operation,
        collection: commit.collection,
        path: `${commit.collection}/${commit.rkey}`,
      },
    };
    await firehoseQueue.add("processFirehoseQueue", data);
  }
});

jetstream.on("close", async () => {
  logger.warn("jetstream closed");
  const timeClosing = new Date().getTime();
  await redisCache.set("jetstreamCursor", timeClosing, "EX", 300);
  throw new Error("Jetstream closed. Forcing restart");
});

jetstream.start();

const workerForceUpdateAtDidCache = new Worker(
  "forceUpdateDids",
  async (job: Job) => {
    logger.info(`Atproto force update of dids`);
    const tmp = await getCacheAtDids(true);
    cachedDids = tmp;
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
