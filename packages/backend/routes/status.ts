import { Application, Response } from "express";
import { adminToken, authenticateToken } from "../utils/authenticateToken.js";
import AuthorizedRequest from "../interfaces/authorizedRequest.js";
import { getQueue } from "../utils/queues.js";
import { FederatedHost } from "../models/index.js";
import { completeEnvironment } from "../utils/backendOptions.js";
import optionalAuthentication from "../utils/optionalAuthentication.js";

export default function statusRoutes(app: Application) {
  app.get(
    "/api/status/workerStats",
    authenticateToken,
    adminToken,
    async (req: AuthorizedRequest, res: Response) => {
      const sendPostsQueue = getQueue("sendPostToInboxes");
      const prepareSendPostQueue = getQueue("prepareSendPost");
      const deletePostQueue = getQueue("deletePostQueue");
      const inboxQueue = getQueue("inbox");
      const firehoseQueue = getQueue("firehoseQueue");
      const mergeUsersQueue = getQueue("mergeUsers");
      const mergePostQueue = getQueue("mergePosts");
      const getRemoteActorQueue = getQueue("getRemoteActorId");
      const sendPostBskyQueue = getQueue("sendPostBsky");
      const workerGenerateUserKeyPair = getQueue("generateUserKeyPair");
      const wsWaitingQueue = getQueue("updateNotificationsSocket");
      const createKeyPairWaiting = workerGenerateUserKeyPair.count();
      const atProtoAwaiting = firehoseQueue.count();
      const sendPostFailed = sendPostsQueue.getMetrics("failed");
      const sendPostSuccess = sendPostsQueue.getMetrics("completed");
      const sendPostAwaiting = sendPostsQueue.count();
      const prepareSendPostFail = prepareSendPostQueue.getMetrics("failed");
      const prepareSendPostSuccess =
        prepareSendPostQueue.getMetrics("completed");
      const prepareSendPostAwaiting = prepareSendPostQueue.count();
      const inboxFail = inboxQueue.getMetrics("failed");
      const inboxSuccess = inboxQueue.getMetrics("completed");
      const inboxAwaiting = inboxQueue.count();
      const deletePostAwaiting = deletePostQueue.count();
      const sendPostBskyAwaiting = sendPostBskyQueue.count();
      const notificationsWSPending = wsWaitingQueue.count();
      const getRemoteActorWaiting = getRemoteActorQueue.count();
      const mergeUsersAwaiting = mergeUsersQueue.count()
      const mergePostsAwaiting = mergePostQueue.count()

      await Promise.allSettled([
        sendPostFailed,
        sendPostSuccess,
        prepareSendPostFail,
        prepareSendPostSuccess,
        inboxFail,
        inboxSuccess,
        sendPostAwaiting,
        prepareSendPostAwaiting,
        inboxAwaiting,
        atProtoAwaiting,
        createKeyPairWaiting,
        sendPostBskyAwaiting,
        notificationsWSPending,
        getRemoteActorWaiting,
        mergeUsersAwaiting,
        mergePostsAwaiting
      ]);

      res.send({
        createKeyPairWaiting: await createKeyPairWaiting,
        sendPostAwaiting: await sendPostAwaiting,
        prepareSendPostAwaiting: await prepareSendPostAwaiting,
        inboxAwaiting: await inboxAwaiting,
        deletePostAwaiting: await deletePostAwaiting,
        atProtoAwaiting: await atProtoAwaiting,
        sendPostBskyAwaiting: await sendPostBskyAwaiting,
        socketPending: await notificationsWSPending,
        getRemoteActorWaiting: await getRemoteActorWaiting,
        mergeUsersAwaiting: await mergeUsersAwaiting,
        mergePostsAwaiting: await mergePostsAwaiting
      });
    }
  );

  app.get(
    "/api/status/bubble",
    optionalAuthentication,
    async (req: AuthorizedRequest, res: Response) => {
      if (
        completeEnvironment.bubbleHostsShowType === 'HIDDEN' ||
        (completeEnvironment.bubbleHostsShowType === 'LOGGEDIN' && !req.jwtData)
      )
        return res.sendStatus(404);
      res.send(
        await FederatedHost.findAll({
          attributes: ["displayName"],
          where: {
            bubbleTimeline: true
          },
        })
      );
    }
  )

  app.get(
    "/api/status/blocks",
    optionalAuthentication,
    async (req: AuthorizedRequest, res: Response) => {
      if (
        completeEnvironment.disableShowingBlockedServers ||
        completeEnvironment.blockedHostsShowType === 'HIDDEN' ||
        (completeEnvironment.blockedHostsShowType === 'LOGGEDIN' && !req.jwtData)
      )
        return res.sendStatus(404);
      res.send(
        await FederatedHost.findAll({
          attributes: ["displayName"],
          where: {
            blocked: true,
          },
        })
      );
    }
  );
}
