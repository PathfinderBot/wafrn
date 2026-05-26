import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { logger } from "./utils/logger.js";

import {
  workerInbox,
  workerPrepareSendPost,
  workerGetUser,
  workerSendPostChunk,
  workerProcessFirehose,
  workerDeletePost,
  workerProcessRemotePostView,
  workerProcessRemoteMediaData,
  workerGenerateUserKeyPair,
} from "./utils/workers.js";

import { SignedRequest } from "./interfaces/fediverse/signedRequest.js";
import { activityPubRoutes } from "./routes/activitypub/activitypub.js";
import { wellKnownRoutes } from "./routes/activitypub/well-known.js";
import adminRoutes from "./routes/admin.js";
import blockRoutes from "./routes/blocks.js";
import blockUserServerRoutes from "./routes/blockUserServer.js";
import dashboardRoutes from "./routes/dashboard.js";
import deletePost from "./routes/deletePost.js";
import emojiReactRoutes from "./routes/emojiReact.js";
import emojiRoutes from "./routes/emojis.js";
import followsRoutes from "./routes/follows.js";
import forumRoutes from "./routes/forum.js";
import { frontend } from "./routes/frontend.js";
import likeRoutes from "./routes/like.js";
import biteRoutes from "./routes/bite.js";
import listRoutes from "./routes/lists.js";
import mediaRoutes from "./routes/media.js";
import muteRoutes from "./routes/mute.js";
import { notificationRoutes } from "./routes/notifications.js";
import pollRoutes from "./routes/polls.js";
import postsRoutes from "./routes/posts.js";
import searchRoutes from "./routes/search.js";
import silencePostRoutes from "./routes/silencePost.js";
import statusRoutes from "./routes/status.js";
import { userRoutes } from "./routes/users.js";
import checkIpBlocked from "./utils/checkIpBlocked.js";
import overrideContentType from "./utils/overrideContentType.js";
import swagger from "swagger-ui-express";
import { readFile } from "fs/promises";
import { Worker } from "bullmq";
import expressWs from "express-ws";
import websocketRoutes from "./routes/websocket.js";
import { followHashtagRoutes } from "./routes/followHashtags.js";
import { completeEnvironment } from "./utils/backendOptions.js";
import cron from "node-cron";
import { nukeBannedUsers } from "./utils/maintenanceTasks/nukeBannedUsers.js";
import { sequelize } from "./models/sequelize.js";
import { Op, Sequelize } from "sequelize";
import { Post } from "./models/post.js";
import { User } from "./models/index.js";
import { follow } from "./utils/follow.js";
import { getAdminUser } from "./utils/getAdminAndDeletedUser.js";
import { redisCache } from "./utils/redis.js";
import { BlockedIps } from "./models/blockedIp.js";

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
    //   // well turns out that we dont have indexes
    //   // we have cleaned duplicated before. if a duplicate apears here we just crash and do it again :3
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
