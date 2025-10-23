import { Queue } from "bullmq";
import { completeEnvironment } from "../backendOptions.js";
import { UserBitesPostRelation } from "../../models/userBitesPostRelation.js";
import { User } from "../../models/user.js";
import { Post, Privacy } from "../../models/post.js";
import { activityPubObject } from "../../interfaces/fediverse/activityPubObject.js";
import sequelize from "sequelize/lib/sequelize";
import { Op } from "sequelize";
import { FederatedHost } from "../../models/federatedHost.js";
import { logger } from "../logger.js";
import { postPetitionSigned } from "./postPetitionSigned.js";

async function bitePostRemote(biteRelation: UserBitesPostRelation) {
  const user = await User.findOne({
    where: {
      id: biteRelation.userId
    }
  })

  const post = await Post.findOne({
    where: {
      id: biteRelation.postId
    },
    include: [
      {
        model: User,
        as: 'user'
      }
    ]
  })

  if (!user || !post) return

  const stringMyFollowers = `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`
  const ownerOfBittenPost = post.user.remoteId || `${completeEnvironment.frontendUrl}/fediverse/blog/${post.user.url}`
  const biteObject: activityPubObject =
  {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      { "Bite": "https://ns.mia.jetzt/as#Bite" }
    ],
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
    id: `${completeEnvironment.frontendUrl}/fediverse/bites/${biteRelation.userId}/${biteRelation.postId}`,
    target: post.remotePostId || `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
    type: 'Bite',
    object: post.remotePostId || `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
    to:
      post.privacy / 1 === Privacy.DirectMessage
        ? [ownerOfBittenPost]
        : post.privacy / 1 === Privacy.Public
          ? ['https://www.w3.org/ns/activitystreams#Public', stringMyFollowers]
          : [stringMyFollowers],
  }

  // servers with shared inbox
  let serversToSendThePost = await FederatedHost.findAll({
    where: {
      publicInbox: { [Op.ne]: null },
      blocked: { [Op.ne]: true },

      [Op.or]: [
        sequelize.literal(
          `"id" in (SELECT "federatedHostId" from "users" where "users"."id" IN (SELECT "followerId" from "follows" where "followedId" = '${biteRelation.userId}') and "federatedHostId" is not NULL)`
        ),
        {
          friendServer: true
        }
      ]
    }
  })

  // for servers with no shared inbox
  const usersToSendThePost = [await User.findByPk(post.userId)]

  try {
    if (post.user.remoteInbox)
      await postPetitionSigned(biteObject, user, post.user.remoteInbox)
  } catch (error) {
    logger.debug(error)
  }

  await Promise.all([serversToSendThePost, usersToSendThePost])
  if (serversToSendThePost?.length > 0 || usersToSendThePost?.length > 0) {
    let inboxes: string[] = []
    inboxes = inboxes.concat(serversToSendThePost.map((elem: any) => elem.publicInbox))
    inboxes = inboxes.concat(usersToSendThePost.map((elem: any) => (elem.remoteInbox ? elem.remoteInbox : '')))

    const sendPostQueue = new Queue('sendPostToInboxes', {
      connection: completeEnvironment.bullmqConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        removeOnFail: true
      }
    })

    for await (const inboxChunk of inboxes) {
      await sendPostQueue.add(
        'sendChunk',
        {
          objectToSend: biteObject,
          petitionBy: user.dataValues,
          inboxList: inboxChunk
        },
        {
          priority: 2097152,
          delay: 500
        }
      )
    }
  }
}

async function biteUserRemote(biter: User, bittenUser: User) {
  const biteObject: activityPubObject = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      { 'Bite': 'https://ns.mia.jetzt/as#Bite' }
    ],
    id: `${completeEnvironment.frontendUrl}/fediverse/bites/${biter.id}/${bittenUser.id}`,
    type: 'Bite',
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${biter.url.toLowerCase()}`,
    target: bittenUser.remoteId,
    object: bittenUser.remoteId,
    to: [bittenUser.remoteId],
  }

  return await postPetitionSigned(biteObject, biter, bittenUser.remoteInbox)
}

export { bitePostRemote, biteUserRemote }