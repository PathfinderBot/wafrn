import express, { } from "express";
import { logger } from "./utils/logger.js";
import expressWs from "express-ws";
import websocketRoutes from "./routes/websocket.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import cron from "node-cron";
import { nukeBannedUsers } from "./utils/maintenanceTasks/nukeBannedUsers.js";
import { sequelize } from "./models/sequelize.js";
import { Op, QueryTypes } from "sequelize";
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
  batchSize: number = 250
) {
  let processed = 0;
  let iteration = 0;

  logger.debug('rootId backfill starting');

  while (true) {
    // Get batch of posts without rootId
    const updateQuery = await sequelize.query(`WITH RECURSIVE
batch AS (
    SELECT id, "parentId"
    FROM posts
    WHERE "rootId" IS NULL
    ORDER BY "hierarchyLevel" ASC
    LIMIT ${batchSize}
),
chain AS (
    SELECT
        b.id            AS start_id,
        p.id            AS current_id,
        p."parentId"    AS current_parent_id,
        p."rootId"      AS current_root_id,
        ARRAY[p.id]     AS visited,
        false           AS orphaned
    FROM batch b
    JOIN posts p ON p.id = b.id
    UNION ALL
    SELECT
        c.start_id,
        p.id,
        p."parentId",
        p."rootId",
        c.visited || p.id,
        (p.id IS NULL)
    FROM chain c
    LEFT JOIN posts p ON p.id = c.current_parent_id
    WHERE
        c.current_root_id IS NULL
        AND c.current_parent_id IS NOT NULL
        AND NOT (c.current_parent_id = ANY(c.visited))
),
resolved AS (
    SELECT DISTINCT ON (start_id)
        start_id,
        CASE
            WHEN current_root_id IS NOT NULL THEN current_root_id
            WHEN current_parent_id IS NULL AND NOT orphaned THEN current_id
            ELSE NULL
        END AS resolved_root_id
    FROM chain
    ORDER BY start_id, array_length(visited, 1) DESC
),
to_update AS (
    SELECT start_id, resolved_root_id
    FROM resolved
    WHERE resolved_root_id IS NOT NULL
),
expanded AS (
    -- descendants via closure table
    SELECT DISTINCT pa."postsId" AS id, t.resolved_root_id AS "rootId"
    FROM to_update t
    JOIN postsancestors pa ON pa."ancestorId" = t.resolved_root_id
    UNION
    -- the batch post itself, in case postsancestors has no self-row
    SELECT t.start_id AS id, t.resolved_root_id AS "rootId"
    FROM to_update t
)
UPDATE posts
SET "rootId" = expanded."rootId"
FROM expanded
WHERE posts.id = expanded.id;`, {
      type: QueryTypes.UPDATE
    })
    const updated = updateQuery[1]
    processed += updated;
    iteration++;
    if (updated === 0) {
      logger.info(`update complete`)
      break;
    }
    else {
      logger.info(`Updating rootId: processed ${processed} (${updated}), iteration ${iteration}`)
    }


    // Wait before next batch
    // await wait(500)
  }
}



backfillRootId()
