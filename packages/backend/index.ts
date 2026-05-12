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
  workerMergeUsers,
  workerMergePost,
  workerDownloadMedia,
  workerSyncBskyFollows,
  workerSyncBskyPosts,
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
import { cacheRoutes } from "./routes/remoteCache.js";
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
import getIp from "./utils/getIP.js";

function errorHandler(err: Error, req: Request, res: Response, next: Function) {
  console.error(err.stack);
  res.send(500).json({ error: "Internal Server Error" });
}

const swaggerJSON = JSON.parse(
  await readFile(new URL("./swagger.json", import.meta.url), "utf-8")
);
// rest of the code remains same
const app = express();
const wsServer = expressWs(app);
const server = wsServer.app;
const PORT = completeEnvironment.port;
app.use(errorHandler);
app.use(overrideContentType);
app.use(checkIpBlocked);
app.use(
  bodyParser.json({
    limit: "50mb",
    verify: (req: SignedRequest, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(cors());
app.set("trust proxy", 1);

app.use("/api/apidocs", swagger.serve, swagger.setup(swaggerJSON));

app.get("/api/", (req, res) =>
  res.send({
    status: true,
    swagger: "API docs at /apidocs",
    readme:
      "welcome to the wafrn api, you better check https://codeberg.org/wafrn/wafrn to figure out where to poke :D. Also, check api/apidocs",
  })
);

// serve static images
app.use("/api/uploads", express.static("uploads"));

app.use("/api/environment", (req: Request, res: Response) => {
  res.send({
    ...completeEnvironment.frontendEnvironment,
    webpushPublicKey: completeEnvironment.webpushPublicKey,
    reviewRegistrations: completeEnvironment.reviewRegistrations,
    maxUploadSize: completeEnvironment.uploadLimit,
    cacheDomain: new URL(completeEnvironment.externalCacheurl).origin,
    featureFlags: {
      drafts: true
    }
  });
});


app.use("/api/myIp", (req: Request, res: Response) => {
  res.send({
    headers: req.headers,
    ip: getIp(req)
  });
});

userRoutes(app);
followsRoutes(app);
blockRoutes(app);
notificationRoutes(app);
mediaRoutes(app);
postsRoutes(app);
searchRoutes(app);
deletePost(app);
if (completeEnvironment.fediPort == completeEnvironment.port) {
  app.use("/contexts", express.static("contexts"));
  activityPubRoutes(app);
  wellKnownRoutes(app);
}
if (completeEnvironment.cachePort == completeEnvironment.port) {
  cacheRoutes(app);
}
likeRoutes(app);
biteRoutes(app);
emojiReactRoutes(app);
adminRoutes(app);
muteRoutes(app);
blockUserServerRoutes(app);
dashboardRoutes(app);
listRoutes(app);
forumRoutes(app);
silencePostRoutes(app);
statusRoutes(app);
emojiRoutes(app);
pollRoutes(app);
followHashtagRoutes(app);
// just websocket things
frontend(app);

server.listen(PORT, completeEnvironment.listenIp, () => {
  logger.info("started main");
  const workers = [
    workerInbox,
    workerSendPostChunk,
    workerPrepareSendPost,
    workerGetUser,
    workerDeletePost,
    workerProcessRemotePostView,
    workerProcessRemoteMediaData,
    workerGenerateUserKeyPair,
    workerMergeUsers,
    workerMergePost,
    workerDownloadMedia,
    workerSyncBskyFollows,
    workerSyncBskyPosts
  ];
  if (completeEnvironment.enableBsky) {
    workers.push(workerProcessFirehose as Worker);
  }
  if (completeEnvironment.workers.mainThread) {
    workers.forEach((worker) => {
      worker.on("error", (err) => {
        logger.warn({
          message: `worker ${worker.name} failed`,
          error: err,
        });
      });
    });
  } else {
    workers.forEach(async (worker) => {
      await worker.pause();
    });
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
});
