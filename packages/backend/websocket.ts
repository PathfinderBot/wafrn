import express, { } from "express";
import { logger } from "./utils/logger.js";
import expressWs from "express-ws";
import websocketRoutes from "./routes/websocket.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import cron from "node-cron";
import { nukeBannedUsers } from "./utils/maintenanceTasks/nukeBannedUsers.js";
import { sequelize } from "./models/sequelize.js";
import { Op } from "sequelize";
import { Post, User } from "./models/index.js";
import { follow } from "./utils/follow.js";
import { getAdminUser } from "./utils/getAdminAndDeletedUser.js";
import { redisCache } from "./utils/redis.js";
import { BlockedIps } from "./models/blockedIp.js";
import { wait } from "./utils/wait.js";

const PORT = completeEnvironment.port;
const app = express();
const wsServer = expressWs(app);
const server = wsServer.app;
websocketRoutes(server);

await redisCache.del('blockedIps');
const blockedIps = await BlockedIps.findAll();
if (blockedIps.length) {
  await redisCache.sadd('blockedIps', blockedIps.map(elem => elem.ip))
}

cron.schedule("0 */2 * * *", async () => {
  // maintenance tasks
  sequelize.query("VACUUM ANALYZE").then(() => {
    logger.info(`postgres vacuum analyze executed`);
  });
});

cron.schedule("0 2 * * *", async () => {
  // maintenance tasks nuking users
  nukeBannedUsers().then(() => {
    logger.info(`NukeBannedUsers Done`);
  });
});

server.listen(PORT, completeEnvironment.listenIp, () => {
  logger.info("started websocket");
});

const queryInterface = sequelize.getQueryInterface();

if (completeEnvironment.autoFollowAdmin) {
  try {
    const users = await User.findAll({
      where: {
        banned: {
          [Op.ne]: true,
        },
        email: {
          [Op.ne]: null,
        },
      },
    });
    const adminUser = await getAdminUser();
    await Promise.all(users.map((x) => follow(x.id, adminUser.id)));
  } catch { }
}
let postIndexes = await queryInterface.showIndex("posts");

if (
  !(postIndexes as Array<any>).some((index) => index.name === "post_bsky_uri")
) {
  logger.warn(
    `ATTENTION: your server doesnt seem to have an unique index on bskyuri. this is a bug. we will investigate soon in a future release`
  );
  clearDuplicatedBskyUris().then(async (res) => {
    //  well turns out that we dont have indexes
    // we have cleaned duplicated before. if a duplicate apears here we just crash and do it again :3
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS post_bsky_uri  ON "posts" ("bskyUri");`
    );
  });
}

async function clearDuplicatedBskyUris(): Promise<boolean> {
  let duplicatedURIs: any = await queryInterface.sequelize.query(
    `UPDATE "posts" SET "bskyUri"= NULL WHERE "bskyUri" IN (SELECT "bskyUri" FROM (SELECT "bskyUri", COUNT(*)
FROM "posts" WHERE "bskyUri" IS NOT NULL
GROUP BY "bskyUri"
HAVING COUNT(*) > 1))`
  );
  return true;
}




async function backfillRootId(
  batchSize: number = 1000
) {
  let processed = 0;
  let skipped = 0;

  logger.debug('rootId backfill starting');

  while (true) {
    // Get batch of posts without rootId
    const batch = await Post.findAll({
      where: { rootId: null },
      attributes: ['id', 'parentId'],
      limit: batchSize,
      raw: true,
    });

    if (batch.length === 0) {
      logger.debug(`Backfill complete. Processed: ${processed}. Skipped: ${skipped}`);
      break;
    }

    // Calculate rootId for each post
    const updates: { id: string; rootId: string; }[] = [];
    for (const post of batch) {
      try {
        const rootId = await findRoot(Post, post.id, post.parentId);
        if (rootId) {
          updates.push({ id: post.id, rootId });
        } else {
          skipped++;
        }
      } catch (error) {
        logger.error({
          message: 'Error processing postId',
          error: error
        });
        skipped++;
      }
    }

    // Batch update in transaction
    if (updates.length > 0) {
      await sequelize.transaction(async (transaction) => {
        for (const update of updates) {
          await Post.update(
            { rootId: update.rootId },
            {
              where: { id: update.id },
              transaction,
              logging: false
            }
          );
        }
      });

      processed += updates.length;
      const totalProcessed = processed + skipped;
      logger.debug(`Processed: ${processed} Skipped: ${skipped} Total: ${totalProcessed}`);
    }

    // Wait before next batch
    await wait(500)
  }
}

const rootCache = new Map<string, string>();

async function findRoot(Post: any, postId: string, parentId: string | null): Promise<string | null> {
  // Check cache first
  if (rootCache.has(postId)) {
    return rootCache.get(postId)!;
  }

  let current = postId;
  const visited = new Set<string>();

  while (true) {
    // Prevent infinite loops (circular references)
    if (visited.has(current)) {
      logger.warn(`Circular reference detected at post ${postId} wtf`);
      return null;
    }
    visited.add(current);

    // Get post
    const post = await Post.findByPk(current, {
      attributes: ['parentId', 'rootId'],
      raw: true,
      logging: false
    });

    if (!post) {
      logger.warn(`Post ${current} not found (orphaned post ${postId})`);
      return null;
    }

    // If already has rootId, use it
    if (post.rootId) {
      rootCache.set(postId, post.rootId);
      return post.rootId;
    }

    // If no parent, this is the root
    if (!post.parentId) {
      rootCache.set(postId, current);
      return current;
    }

    // Continue up chain
    current = post.parentId;
  }
}


backfillRootId()



