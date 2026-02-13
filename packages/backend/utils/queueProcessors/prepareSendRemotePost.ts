import { Model, Op, Sequelize } from "sequelize";
import { logger } from "../logger.js";
import { postPetitionSigned } from "../activitypub/postPetitionSigned.js";
import {
  getPostUrlForQuote,
  postToJSONLD,
} from "../activitypub/postToJSONLD.js";
import { LdSignature } from "../activitypub/rsa2017.js";
import {
  FederatedHost,
  Post,
  User,
  PostHostView,
  RemoteUserPostView,
  sequelize,
  Media,
  Quotes,
  PostTag,
} from "../../models/index.js";
import { Job, Queue } from "bullmq";
import { Privacy } from "../../models/post.js";
import { completeEnvironment } from "../backendOptions.js";
import { activityPubObject } from "../../interfaces/fediverse/activityPubObject.js";
import { getPetitionSigned } from "../activitypub/getPetitionSigned.js";
import { include } from "underscore";
import { wait } from "../wait.js";

const processPostViewQueue = new Queue("processRemoteView", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 25000,
    },
    removeOnFail: true,
  },
});

const sendPostQueue = new Queue("sendPostToInboxes", {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: "fixed",
      delay: 25000,
    },
    removeOnFail: true,
  },
});

async function prepareSendRemotePostWorker(job: Job) {
  let highPriorityInboxes: string[] = [];
  //async function sendRemotePost(localUser: any, post: any) {
  const post = await Post.findByPk(job.id);
  if (!post) {
    return;
  }

  const localUser = await User.scope("full").findByPk(post.userId);
  const parents = await post.getAncestors({
    include: [
      {
        model: User,
        as: "user",
      },
    ],
  });
  // we check if we need to send the post to fedi
  const sendPostToFedi = parents.every((elem) => elem.postShouldGoFedi);
  if (localUser && sendPostToFedi) {
    // we get quote authorizations
    const quotes = (
      await Quotes.findAll({
        include: [
          {
            model: Post,
            as: "quotedPost",
            include: [{ model: User, as: "user" }],
          },
        ],
        where: {
          quoterPostId: post.id,
        },
      })
    ).filter(
      (quote: any) => !!quote.dataValues.quotedPost.dataValues.user.remoteId
    );
    // TODO change in the future if fedi decides to do more than one quote
    if (quotes && quotes.length == 1) {
      const quote: any = quotes[0];
      const objectToSend: activityPubObject = {
        "@context": [
          "https://www.w3.org/ns/activitystreams",
          `${completeEnvironment.frontendUrl}/contexts/litepub-0.1.jsonld`,
        ],
        actor: `${
          completeEnvironment.frontendUrl
        }/fediverse/blog/${localUser.url.toLowerCase()}`,
        id: `${completeEnvironment.frontendUrl}/fediverse/quote_request/${post.id}`,
        type: "QuoteRequest",
        object: await getPostUrlForQuote(quote.dataValues.quotedPost),
        instrument: await postToJSONLD(post.id),
      };
      await RemoteUserPostView.findOrCreate({
        where: {
          postId: post.id,
          userId: quote.dataValues.quotedPost.dataValues.user.id,
        },
      });

      highPriorityInboxes.push(
        quote.dataValues.quotedPost.dataValues.user.remoteInbox
      );
    }
    // servers with shared inbox
    let serversToSendThePost: FederatedHost[] = [];
    const localUserFollowers = await localUser.getFollower();
    const followersServers = [
      ...new Set(localUserFollowers.map((el: any) => el.federatedHostId)),
    ];
    // for servers with no shared inbox
    let usersToSendThePost = await FederatedHost.findAll({
      where: {
        publicInbox: { [Op.eq]: null },
        blocked: false,
      },
      include: [
        {
          required: true,
          model: User,
          attributes: ["remoteInbox", "id"],
          where: {
            banned: false,
            id: {
              [Op.in]: (
                await localUser.getFollower()
              ).map((usr: any) => usr.id),
            },
          },
        },
      ],
    });
    // mentioned users
    const mentionedUsers = await post.getMentionPost();
    switch (post.privacy) {
      case Privacy.LocalOnly: {
        break;
      }
      case Privacy.DirectMessage: {
        serversToSendThePost = [];
        usersToSendThePost = [];
        break;
      }
      default: {
        serversToSendThePost = await FederatedHost.findAll({
          where: {
            publicInbox: { [Op.notIn]: [''], [Op.ne]: null },
            blocked: { [Op.ne]: true },
            [Op.or]: [
              {
                id: {
                  [Op.in]: followersServers,
                },
              },
              {
                friendServer: true,
              },
            ],
          },
        });
      }
    }

    let userViews = usersToSendThePost
      .flatMap((usr: any) => usr.users)
      .map((elem: any) => {
        return {
          userId: elem.id,
          postId: post.id,
        };
      })
      .concat(
        mentionedUsers.map((elem: any) => {
          return {
            userId: elem.id,
            postId: post.id,
          };
        })
      );

    // we store the fact that we have sent the post in a queue
    await processPostViewQueue.addBulk(
      serversToSendThePost.map((host: any) => {
        return {
          name: host.displayName + post.id,
          data: {
            postId: post.id,
            federatedHostId: host.id,
            userId: "",
          },
        };
      })
    );
    // we store the fact that we have sent the post in a queue
    await processPostViewQueue.addBulk(
      userViews.map((userView: any) => {
        return {
          name: userView.userId + post.id,
          data: {
            postId: post.id,
            federatedHostId: "",
            userId: userView.userId,
          },
        };
      })
    );

    await RemoteUserPostView.bulkCreate(userViews, {
      ignoreDuplicates: true,
    });

    const objectToSend = await postToJSONLD(post.id);
    if (!objectToSend) {
      return;
    }
    try {
      const ldSignature = new LdSignature();
      if (localUser.privateKey) {
        const bodySignature = await ldSignature.signRsaSignature2017(
          objectToSend,
          localUser.privateKey,
          `${
            completeEnvironment.frontendUrl
          }/fediverse/blog/${localUser.url.toLocaleLowerCase()}`,
          completeEnvironment.instanceUrl,
          new Date(post.createdAt)
        );

        const objectToSendComplete = {
          ...objectToSend,
          signature: bodySignature.signature,
        };
        if (mentionedUsers?.length > 0) {
          const mentionedInboxes = mentionedUsers.map(
            (elem: any) => elem.remoteInbox
          );
          for await (const mentionedUser of mentionedUsers.filter(
            (elem) => elem.remoteId
          )) {
            await RemoteUserPostView.findOrCreate({
              where: {
                postId: post.id,
                userId: mentionedUser.id,
              },
            });
          }
          for await (const remoteInbox of mentionedInboxes) {
            highPriorityInboxes.push(remoteInbox);
          }
        }
        if (post.isReblog) {
          const parent = await Post.findByPk(post.parentId, {
            include: [{ model: User, as: "user" }],
          });
          if (parent && parent.user?.remoteInbox) {
            highPriorityInboxes.push(parent.user.remoteInbox);
            await RemoteUserPostView.findOrCreate({
              where: {
                postId: post.id,
                userId: parent.user.id,
              },
            });
          }
        }

        if (
          serversToSendThePost.length > 0 ||
          usersToSendThePost.length > 0 ||
          highPriorityInboxes.length > 0
        ) {
          let inboxes: string[] = [];
          inboxes = inboxes.concat(
            serversToSendThePost.map((elem: any) => elem.publicInbox)
          );
          usersToSendThePost?.forEach((server: any) => {
            inboxes = inboxes.concat(
              server.users.map((elem: any) => elem.remoteInbox)
            );
          });
          const addSendPostToQueuePromises: Promise<any>[] = [];
          for (const inboxChunk of highPriorityInboxes.concat(inboxes)) {
            addSendPostToQueuePromises.push(
              sendPostQueue.add(
                "sendChunk",
                {
                  objectToSend: objectToSendComplete,
                  petitionBy: localUser.dataValues,
                  inboxList: inboxChunk,
                },
                {
                  priority: 1,
                }
              )
            );
          }
          await Promise.allSettled(addSendPostToQueuePromises);
        }
      }
    } catch (error) {
      logger.info({
        message: `Error signing fedi post`,
        error,
      });
    }
  }
}

export { prepareSendRemotePostWorker };
