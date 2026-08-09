import { Op, Sequelize } from 'sequelize'
import { Emoji, EmojiReaction, FederatedHost, Post, User, sequelize } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { activityPubObject } from '../interfaces/fediverse/activityPubObject.js'
import { postPetitionSigned } from './postPetitionSigned.js'
import { logger } from '../utils/logger.js'
import { Queue } from 'bullmq'
import _ from 'underscore'
import { emojiToAPTag } from './emojiToAPTag.js'
import { Privacy } from '../models/post.js'
import { getAllLocalUserIds, getAllLocalUserIdsSet } from '../utils/cacheGetters/getAllLocalUserIds.js'
import { getQueue } from '../utils/queues.js'
import { LITEPUB_CONTEXT_PATH } from './contexts.js'

const sendPostQueue = getQueue('sendPostToInboxes')

async function getInboxesForActivity(actorUserId: string, postOwnerId: string) {
  const serversToSendThePostPromise = FederatedHost.findAll({
    where: {
      publicInbox: { [Op.ne]: null },
      blocked: { [Op.ne]: true },
      [Op.or]: [
        sequelize.literal(
          `"id" in (SELECT "federatedHostId" from "users" where "users"."id" IN (SELECT "followerId" from "follows" where "followedId" = '${actorUserId}') and "federatedHostId" is not NULL)`
        ),
        {
          friendServer: true
        }
      ]
    }
  })

  const localUsersPromise = getAllLocalUserIdsSet()
  const postOwnerPromise = User.findByPk(postOwnerId)

  const [serversToSendThePost, localUsers, postOwner] = await Promise.all([
    serversToSendThePostPromise,
    localUsersPromise,
    postOwnerPromise
  ])

  const usersToSendThePost = [postOwner].filter((elem) => elem && !localUsers.has(elem.id)) as User[]

  let inboxes: string[] = []
  inboxes = inboxes.concat(usersToSendThePost.map((elem: any) => (elem.remoteInbox ? elem.remoteInbox : '')))
  inboxes = inboxes.concat(serversToSendThePost.map((elem: any) => elem.publicInbox))

  return inboxes
}

/**
 * Queues an activity to be delivered to every inbox in `inboxes`.
 */
async function queueActivityToInboxes(
  objectToSend: activityPubObject,
  petitionBy: User,
  inboxes: string[],
  priority = 2097151,
  delay?: number
) {
  if (!inboxes?.length) return
  for await (const inboxChunk of inboxes) {
    await sendPostQueue.add(
      'sendChunk',
      {
        objectToSend,
        petitionBy: petitionBy.dataValues,
        inboxList: inboxChunk
      },
      delay ? { priority, delay } : { priority }
    )
  }
}

async function likePostRemote(like: any, dislike = false) {
  const user = await User.findOne({
    where: {
      id: like.userId
    }
  })
  const likedPost = await Post.findOne({
    where: {
      id: like.postId
    },
    include: [
      {
        model: User,
        as: 'user'
      }
    ]
  })

  if (!user || !likedPost) return

  const stringMyFollowers = `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`
  const ownerOfLikedPost = likedPost.user.remoteId
    ? likedPost.user.remoteId
    : `${completeEnvironment.frontendUrl}/fediverse/blog/${likedPost.user.url}`
  const likeObject: activityPubObject = !dislike
    ? {
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
        ],
        actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
        to:
          likedPost.privacy / 1 === Privacy.DirectMessage
            ? [ownerOfLikedPost]
            : likedPost.privacy / 1 === Privacy.Public
              ? ['https://www.w3.org/ns/activitystreams#Public', stringMyFollowers]
              : [stringMyFollowers],
        cc: likedPost.privacy / 1 === Privacy.Public ? [ownerOfLikedPost] : [],
        id: `${completeEnvironment.frontendUrl}/fediverse/likes/${like.userId}/${like.postId}`,
        object: likedPost.remotePostId
          ? likedPost.remotePostId
          : `${completeEnvironment.frontendUrl}/fediverse/post/${likedPost.id}`,
        type: 'Like'
      }
    : {
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
        ],
        actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
        to:
          likedPost.privacy / 1 === Privacy.DirectMessage
            ? [ownerOfLikedPost]
            : likedPost.privacy / 1 === Privacy.Public
              ? ['https://www.w3.org/ns/activitystreams#Public', stringMyFollowers]
              : [stringMyFollowers],
        cc: likedPost.privacy / 1 === Privacy.Public ? [ownerOfLikedPost] : [],
        id: `${completeEnvironment.frontendUrl}/fediverse/undo/likes/${like.userId}/${like.postId}`,
        object: `${completeEnvironment.frontendUrl}/fediverse/likes/${like.userId}/${like.postId}`,
        type: 'Undo'
      }

  // petition to owner of the post:
  const ownerOfPostLikePromise = likedPost.user.remoteInbox
    ? postPetitionSigned(likeObject, user, likedPost.user.remoteInbox)
    : true

  const inboxesPromise = getInboxesForActivity(like.userId, likedPost.userId)

  try {
    await ownerOfPostLikePromise
  } catch (error) {
    logger.debug(error)
  }

  const inboxes = await inboxesPromise
  await queueActivityToInboxes(likeObject, user, inboxes, 2097151, 500)
}

async function emojiReactRemote(react: EmojiReaction, undo = false) {
  const user = await User.findOne({
    where: {
      id: react.userId
    }
  })
  const reactedPost = await Post.findOne({
    where: {
      id: react.postId
    },
    include: [
      {
        model: User,
        as: 'user'
      }
    ]
  })
  if (!user || !reactedPost) return

  const emoji = await Emoji.findByPk(react.emojiId)
  const stringMyFollowers = `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`
  const ownerOfreactedPost = reactedPost.user.remoteId
    ? reactedPost.user.remoteId
    : `${completeEnvironment.frontendUrl}/fediverse/blog/${reactedPost.user.url}`
  let emojireactObject: activityPubObject = {
    '@context': ['https://www.w3.org/ns/activitystreams', `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`],
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
    to:
      reactedPost.privacy / 1 === Privacy.DirectMessage
        ? [ownerOfreactedPost]
        : reactedPost.privacy / 1 === Privacy.Public
          ? ['https://www.w3.org/ns/activitystreams#Public', stringMyFollowers]
          : [stringMyFollowers],
    cc: reactedPost.privacy / 1 === Privacy.Public ? [ownerOfreactedPost] : [],
    id: `${completeEnvironment.frontendUrl}/fediverse/emojiReact/${react.userId}/${react.postId}/${react.emojiId}`,
    object: reactedPost.remotePostId
      ? reactedPost.remotePostId
      : `${completeEnvironment.frontendUrl}/fediverse/post/${reactedPost.id}`,
    tag: emoji ? [emojiToAPTag(emoji)] : undefined,
    content: emoji ? emoji.name : react.content,
    type: 'EmojiReact'
  }
  if (undo) {
    emojireactObject = {
      '@context': [
        'https://www.w3.org/ns/activitystreams',
        `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
      ],
      actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
      to:
        reactedPost.privacy / 1 === Privacy.DirectMessage
          ? [ownerOfreactedPost]
          : reactedPost.privacy / 1 === Privacy.Public
            ? ['https://www.w3.org/ns/activitystreams#Public', stringMyFollowers]
            : [stringMyFollowers],
      cc: reactedPost.privacy / 1 === Privacy.Public ? [ownerOfreactedPost] : [],
      id: `${completeEnvironment.frontendUrl}/fediverse/undo/emojiReact/${react.userId}/${react.postId}/${react.emojiId}`,
      object: emojireactObject,
      type: 'Undo'
    }
  }

  // petition to owner of the post:
  const ownerOfPostLikePromise = reactedPost.user.remoteInbox
    ? postPetitionSigned(emojireactObject, user, reactedPost.user.remoteInbox)
    : true

  const inboxesPromise = getInboxesForActivity(react.userId, reactedPost.userId)

  try {
    await ownerOfPostLikePromise
  } catch (error) {
    logger.debug(error)
  }

  const inboxes = await inboxesPromise
  await queueActivityToInboxes(emojireactObject, user, inboxes)
}

async function pinPost(post: Post, undo = false) {
  const user = (await User.scope('full').findByPk(post.userId)) as User

  const activity: activityPubObject = {
    '@context': ['https://www.w3.org/ns/activitystreams', `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`],
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
    cc: [`${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`],
    id: `${completeEnvironment.frontendUrl}/fediverse/${undo ? 'unpin' : 'pin'}/${post.id}`,
    object: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
    target: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/featured`,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    type: undo ? 'Remove' : 'Add'
  }

  // a pinned post is always the user's own post, so there's no separate "post owner" to petition directly -
  // the actor pinning it *is* the post owner. We only need to fan this out to followers' servers.
  const inboxes = await getInboxesForActivity(post.userId, post.userId)
  await queueActivityToInboxes(activity, user, inboxes)
}

export { likePostRemote, emojiReactRemote, pinPost }
