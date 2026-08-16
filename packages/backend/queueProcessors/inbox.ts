import { Job } from 'bullmq'
import { logger } from '../utils/logger.js'
import {
  Blocks,
  Emoji,
  EmojiReaction,
  FederatedHost,
  Follows,
  Post,
  Quotes,
  User,
  UserLikesPostRelations
} from '../models/index.js'
import { getRemoteActor } from '../activitypub/getRemoteActor.js'
import { signAndAccept } from '../activitypub/signAndAccept.js'
import { removeUser } from '../activitypub/removeUser.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import getUserBlockedServers from '../utils/cacheGetters/getUserBlockedServers.js'
import { deletePostCommon } from '../services/deletePost.js'
import { AcceptActivity } from './processors/accept.js'
import { AnnounceActivity } from './processors/announce.js'
import { CreateActivity } from './processors/create.js'
import { FollowActivity } from './processors/follow.js'
import { UpdateActivity } from './processors/update.js'
import { UndoActivity } from './processors/undo.js'
import { LikeActivity } from './processors/like.js'
import { DeleteActivity } from './processors/delete.js'
import { EmojiReactActivity } from './processors/emojiReact.js'
import { RemoveActivity } from './processors/remove.js'
import { AddActivity } from './processors/add.js'
import { BlockActivity } from './processors/block.js'
import { MoveActivity } from './processors/move.js'
import { RejectActivity } from './processors/reject.js'
import { wait } from '../utils/wait.js'
import { flagActivity } from './processors/flag.js'
import { getPetitionSigned } from '../activitypub/getPetitionSigned.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { activityPubObject } from '../interfaces/fediverse/activityPubObject.js'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { postPetitionSigned } from '../activitypub/postPetitionSigned.js'
import { biteActivity } from './processors/bite.js'
import { LITEPUB_CONTEXT_PATH } from '../activitypub/contexts.js'
import { canInteract } from '../services/baseQueryNew.js'
import { getApObjectPrivacy } from '../activitypub/getPrivacy.js'

async function inboxWorker(job: Job) {
  try {
    const user = await User.findByPk(job.data.petitionBy)
    if (!user) {
      return
    }

    const body = job.data.petition
    const req = { body: body }
    // little hack that should be fixed later
    if (req.body.type === 'Delete' && req.body.id.endsWith('#delete')) {
      const targetRemoteId = req.body.id.split('#')[0].toLowerCase()
      const actor = typeof req.body.actor === 'string' ? req.body.actor.toLowerCase() : undefined
      if (actor && actor === targetRemoteId) {
        const userToRemove = await User.findOne({
          where: {
            remoteId: targetRemoteId
          }
        })
        if (userToRemove) {
          await removeUser(userToRemove.id)
          return
        }
      } else {
        logger.debug({
          message:
            'Rejected federation #delete shortcut: actor does not match target account (possible cross-account deletion attempt)',
          actor: req.body.actor,
          target: targetRemoteId
        })
        return
      }
    }
    const remoteUser = await getRemoteActor(req.body.actor, user, false, true)
    const host = await FederatedHost.findOne({
      where: {
        displayName: new URL(req.body.actor).host
      }
    })
    if (remoteUser) {
      // we check if the user has blocked the user or the server. This will mostly work for follows and dms. Will investigate further down the line
      const userBlocks: string[] = await getBlockedIds(user.id, false, true)
      const blocksExisting = userBlocks.includes(remoteUser.id) ? 1 : 0
      const blockedServersData = await getUserBlockedServers(user.id)
      const blocksServers = blockedServersData.find((elem: any) => elem.id === host?.id) ? 1 : 0
      if (
        (!remoteUser?.banned && !host?.blocked && blocksExisting + blocksServers === 0) ||
        req.body.type === 'Undo' ||
        req.body.type === 'Delete'
      ) {
        switch (req.body.type) {
          case 'Accept': {
            await AcceptActivity(body, remoteUser, user)
            break
          }
          case 'Reject': {
            await RejectActivity(body, remoteUser, user)
            break
          }
          case 'Announce': {
            await AnnounceActivity(body, remoteUser, user)
            break
          }
          case 'Page':
          case 'Create': {
            await CreateActivity(body, remoteUser, user)
            break
          }
          case 'Follow': {
            await FollowActivity(body, remoteUser, user)
            break
          }
          case 'Update': {
            await wait(5000)
            await UpdateActivity(body, remoteUser, user)
            break
          }
          case 'Undo': {
            await UndoActivity(body, remoteUser, user)
            break
          }
          case 'Like': {
            await LikeActivity(body, remoteUser, user)
            break
          }
          case 'Delete': {
            await DeleteActivity(body, remoteUser, user)
            break
          }
          case 'EmojiReact': {
            await EmojiReactActivity(body, remoteUser, user)
            break
          }
          case 'Remove': {
            await RemoveActivity(body, remoteUser, user)
            break
          }
          case 'Add': {
            await AddActivity(body, remoteUser, user)
            break
          }
          case 'Block': {
            await BlockActivity(body, remoteUser, user)
            break
          }

          case 'Move': {
            await MoveActivity(body, remoteUser, user)
            break
          }

          case 'Flag': {
            await flagActivity(body, remoteUser, user)
            break
          }

          case 'Bite': {
            await biteActivity(body, remoteUser, user)
            break
          }

          // activities that we ignore:
          case 'CacheFile':
          case 'Playlist':
          case 'Listen':
          case 'View': {
            // await signAndAccept(req, remoteUser, user)
            break
          }

          case 'QuoteRequest':
            {
              if (req.body.object && req.body.object.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)) {
                const postId = req.body.object.split(`${completeEnvironment.frontendUrl}/fediverse/post/`)[1]
                const post: any = await Post.findByPk(postId, {
                  include: [
                    {
                      model: User,
                      as: 'user'
                    }
                  ]
                })
                const quoterPost = await getPostThreadRecursive(await getAdminUser(), req.body.instrument.id)
                if (post && quoterPost) {
                  // TODO in case of rejecting quotes on fedi we would do here
                  await Quotes.findOrCreate({
                    where: {
                      quoterPostId: quoterPost.id,
                      quotedPostId: post.id
                    },
                    defaults: {
                      quoterPostId: quoterPost.id,
                      quotedPostId: post.id
                    }
                  })

                  const quoteAuthorizationUrl = `${completeEnvironment.frontendUrl}/fediverse/quote_authorization/${quoterPost.id}/${post.id}`

                  const acceptToSend: activityPubObject = {
                    '@context': [
                      'https://www.w3.org/ns/activitystreams',
                      `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
                    ],
                    actor: `${
                      completeEnvironment.frontendUrl
                    }/fediverse/blog/${post?.dataValues.user.url.toLowerCase()}`,
                    id: `${completeEnvironment.frontendUrl}/fediverse/quote_request/${quoterPost.id}`,
                    type: 'Accept',
                    object: req.body,
                    result: quoteAuthorizationUrl
                  }

                  await postPetitionSigned(
                    acceptToSend,
                    (await User.scope('full').findByPk(post.userId)) as User,
                    remoteUser.remoteInbox ?? ''
                  )
                }
              }
            }
            break

          // FEP-6fce: a remote actor politely asking to reply to / reblog one of our posts that has a
          // manualApproval interactionPolicy. We do not have manual review yet, so we accept (or reject)
          // immediately based on the same audience rules canInteract already enforces for our own posts.
          case 'ReplyRequest':
            {
              if (req.body.object && req.body.object.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)) {
                const postId = req.body.object.split(`${completeEnvironment.frontendUrl}/fediverse/post/`)[1]
                const targetPost: any = await Post.findByPk(postId, {
                  include: [{ model: User, as: 'user' }]
                })
                const instrumentUrl =
                  typeof req.body.instrument === 'string' ? req.body.instrument : req.body.instrument?.id
                const replyPost = instrumentUrl
                  ? await getPostThreadRecursive(await getAdminUser(), instrumentUrl)
                  : undefined
                if (targetPost && replyPost) {
                  const allowed = await canInteract(targetPost.replyControl, replyPost.userId, targetPost.id)
                  const acceptOrReject: activityPubObject = {
                    '@context': [
                      'https://www.w3.org/ns/activitystreams',
                      `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
                    ],
                    actor: `${
                      completeEnvironment.frontendUrl
                    }/fediverse/blog/${targetPost.dataValues.user.url.toLowerCase()}`,
                    id: `${completeEnvironment.frontendUrl}/fediverse/reply_request/${replyPost.id}`,
                    type: allowed ? 'Accept' : 'Reject',
                    object: req.body,
                    ...(allowed
                      ? { result: `${completeEnvironment.frontendUrl}/fediverse/reply_authorization/${replyPost.id}` }
                      : {})
                  } as activityPubObject
                  await postPetitionSigned(
                    acceptOrReject,
                    (await User.scope('full').findByPk(targetPost.userId)) as User,
                    remoteUser.remoteInbox ?? ''
                  )
                }
              }
            }
            break

          case 'AnnounceRequest':
            {
              if (req.body.object && req.body.object.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)) {
                const postId = req.body.object.split(`${completeEnvironment.frontendUrl}/fediverse/post/`)[1]
                const targetPost: any = await Post.findByPk(postId, {
                  include: [{ model: User, as: 'user' }]
                })
                const instrumentUrl =
                  typeof req.body.instrument === 'string' ? req.body.instrument : req.body.instrument?.id
                if (targetPost && instrumentUrl) {
                  let reblogPost = await Post.findOne({ where: { remotePostId: instrumentUrl } })
                  if (!reblogPost) {
                    const remoteAnnounce = await getPetitionSigned(await getAdminUser(), instrumentUrl)
                    if (remoteAnnounce) {
                      let createdAt = remoteAnnounce.published ? new Date(remoteAnnounce.published) : new Date()
                      if (createdAt.getTime() > new Date().getTime()) {
                        createdAt = new Date()
                      }
                      reblogPost = await Post.create({
                        content: '',
                        isReblog: true,
                        content_warning: '',
                        createdAt,
                        updatedAt: createdAt,
                        userId: remoteUser.id,
                        remotePostId: instrumentUrl,
                        privacy: getApObjectPrivacy(remoteAnnounce, remoteUser),
                        parentId: targetPost.id
                      })
                    }
                  }
                  if (reblogPost) {
                    const allowed = await canInteract(targetPost.reblogControl, reblogPost.userId, targetPost.id)
                    const acceptOrReject: activityPubObject = {
                      '@context': [
                        'https://www.w3.org/ns/activitystreams',
                        `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`
                      ],
                      actor: `${
                        completeEnvironment.frontendUrl
                      }/fediverse/blog/${targetPost.dataValues.user.url.toLowerCase()}`,
                      id: `${completeEnvironment.frontendUrl}/fediverse/announce_request/${reblogPost.id}`,
                      type: allowed ? 'Accept' : 'Reject',
                      object: req.body,
                      ...(allowed
                        ? {
                            result: `${completeEnvironment.frontendUrl}/fediverse/announce_authorization/${reblogPost.id}`
                          }
                        : {})
                    } as activityPubObject
                    await postPetitionSigned(
                      acceptOrReject,
                      (await User.scope('full').findByPk(targetPost.userId)) as User,
                      remoteUser.remoteInbox ?? ''
                    )
                  }
                }
              }
            }
            break

          default: {
            logger.info(`NOT IMPLEMENTED: ${req.body.type}`)
            logger.info(req.body)
          }
        }
      }
    }
  } catch (err) {
    logger.debug(err)
    const error = new Error('error')
  }
}

export { inboxWorker }
