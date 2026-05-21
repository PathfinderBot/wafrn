import { Collection, Jetstream } from "@skyware/jetstream";
import { Job, Worker } from "bullmq";
import { checkCommitMentions } from "./atproto/utils/checkCommitMentions.js";
import { logger } from "./utils/logger.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import { redisCache } from "./utils/redis.js";
import { forceUpdateDidsCacheQueue } from "./interfaces/atproto/forceUpdateDidsCacheUpdate.js";
import { getQueue } from "./utils/queues.js";
import {
  FOLLOWED_BSKY_DIDS_CACHE_KEY,
  FOLLOWED_HASHTAGS_CACHE_KEY,
  LOCAL_USER_DIDS_CACHE_KEY,
} from "./constants.js";

import { forcePopulateCache } from "./atproto/cache/forcePopulateCache.js";

const firehoseQueue = getQueue("firehoseQueue");
const lowPriorityFirehoseQueue = getQueue("lowPriorityFirehoseQueue");

async function getCursor(): Promise<number> {
  const cursorCache = await redisCache.get("jetstreamCursor");

  if (!cursorCache) {
    return Date.now();
  }

  const parsed = Number(cursorCache);

  if (Number.isNaN(parsed)) {
    logger.warn({
      message: "Invalid jetstream cursor in cache",
      cursorCache,
    });

    return Date.now();
  }

  return parsed;
}

async function ensureCacheLoaded() {
  const cacheLoaded = await redisCache.exists(
    LOCAL_USER_DIDS_CACHE_KEY,
  );

  if (!cacheLoaded) {
    await forcePopulateCache();
  }
}

let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;

let jetstream: Jetstream<"app.bsky.feed.threadgate" | "app.bsky.feed.like" | "app.bsky.feed.post" | "app.bsky.feed.repost" | "app.bsky.graph.block" | "app.bsky.graph.follow" | "net.wafrn.feed.bite", Collection> | null = null

async function startJetstream() {
  const cursor = await getCursor();

  logger.info({
    message: "Starting jetstream",
    cursor,
  });

  jetstream = new Jetstream({
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
    cursor,
  });

  jetstream.on("commit", async (event) => {
    try {
      const commit = event.commit;
      const shouldProcess = await checkCommitMentions(
        event.did,
        commit as any,
      );

      if (!shouldProcess) {
        return;
      }

      await redisCache.set(
        "jetstreamCursor",
        String(event.time_us),
      );

      const data = {
        repo: event.did,
        operation: {
          ...(commit as any),
          action: commit.operation,
          collection: commit.collection,
          path: `${commit.collection}/${commit.rkey}`,
        },
      };

      const isLowPriority =
        commit.operation === "delete" ||
        [
          "app.bsky.graph.follow",
          "app.bsky.feed.like",
        ].includes(commit.collection);

      if (isLowPriority) {
        await lowPriorityFirehoseQueue.add(
          "lowPriorityFirehoseQueue",
          data,
        );
      } else {
        await firehoseQueue.add(
          "processFirehoseQueue",
          data,
        );
      }
    } catch (error) {
      logger.error({
        message: "Error processing jetstream commit",
        error,
      });
    }
  });

  jetstream.on("error", (error) => {
    logger.error({
      message: "Jetstream error",
      error,
    });
  });

  jetstream.on("close", async () => {
    logger.debug("Jetstream closed");
    jetstream = null;
    await redisCache.set(
      "jetstreamCursor",
      String(Date.now()),
    );

    scheduleReconnect();
  });

  jetstream.start();

  reconnectAttempts = 0;
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    return;
  }

  reconnectAttempts++;

  const delay = Math.min(
    1000 * 2 ** reconnectAttempts,
    30000,
  );

  logger.warn({
    message: "Scheduling jetstream reconnect",
    reconnectAttempts,
    delay,
  });

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;

    try {
      await startJetstream();
    } catch (error) {
      logger.error({
        message: "Failed to restart jetstream",
        error,
      });

      scheduleReconnect();
    }
  }, delay);
}

await ensureCacheLoaded();
await startJetstream();

const workerForceUpdateAtDidCache = new Worker(
  "forceUpdateDids",
  async (job: Job) => {
    const data = job.data as forceUpdateDidsCacheQueue;

    if (data?.addFollowedDid) {
      await redisCache.sadd(
        FOLLOWED_BSKY_DIDS_CACHE_KEY,
        data.addFollowedDid,
      );
    }

    if (data?.addLocalUserDid) {
      await redisCache.sadd(
        LOCAL_USER_DIDS_CACHE_KEY,
        data.addLocalUserDid,
      );
    }

    if (data?.addFollowedHashtag) {
      await redisCache.sadd(
        FOLLOWED_HASHTAGS_CACHE_KEY,
        data.addFollowedHashtag.toLowerCase().trim(),
      );
    }
  },
  {
    connection: completeEnvironment.bullmqConnection,
    concurrency: 1,
    lockDuration: 120000,
  },
);

workerForceUpdateAtDidCache.on("failed", (err) => {
  logger.warn({
    message: "workerForceUpdateDids failed",
    error: err,
  });
});

logger.info("started atproto");