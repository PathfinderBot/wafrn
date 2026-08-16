import { Op } from 'sequelize'
import {
  Blocks,
  Emoji,
  FederatedHost,
  Media,
  Post,
  PostMentionsUserRelation,
  ServerBlock,
  PostTag,
  User,
  sequelize,
  Ask,
  Notification
} from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { logger } from '../utils/logger.js'
import { getRemoteActor } from './getRemoteActor.js'
import { getPetitionSigned } from './getPetitionSigned.js'
import { fediverseTag } from '../interfaces/fediverse/tags.js'
import { loadPoll } from './loadPollFromPost.js'
import { getApObjectPrivacy } from './getPrivacy.js'
import dompurify from 'isomorphic-dompurify'
import { Queue } from 'bullmq'
import { bulkCreateNotifications, createNotification } from '../services/pushNotifications.js'
import { getDeletedUser } from '../utils/cacheGetters/getDeletedUser.js'
import {
  AutomaticToManualApprovalEquivalent,
  InteractionControl,
  InteractionControlType,
  Privacy
} from '../models/post.js'
import { getAtprotoRecordDirect, processSinglePost } from '../atproto/utils/getAtProtoThread.js'
import * as cheerio from 'cheerio'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import escapeHTML from 'escape-html'
import { canInteract } from '../services/baseQueryNew.js'
import { getAllLocalUserIdsSet } from '../utils/cacheGetters/getAllLocalUserIds.js'
import { getQueue } from '../utils/queues.js'
import { filterLanguageCode } from '../utils/languages.js'
import extractMediaFromHtmlPost from '../services/extractMediaFromHtmlPost.js'

const updateMediaDataQueue = getQueue('processRemoteMediaData')

const mergeBskyPostRelatedRecordsSql = `
  WITH
  updated_emoji_reactions AS (
    UPDATE "emojiReactions"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_notifications AS (
    UPDATE "notifications"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_post_reports AS (
    UPDATE "postReports"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_question_polls AS (
    UPDATE "questionPolls"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_quoter_quotes AS (
    UPDATE "quotes" AS quotes
    SET "quoterPostId" = :remotePostId, "updatedAt" = NOW()
    WHERE quotes."quoterPostId" = :existingPostId
      AND NOT EXISTS (
        SELECT 1
        FROM "quotes" AS existing_quotes
        WHERE existing_quotes."quoterPostId" = :remotePostId
          AND existing_quotes."quotedPostId" = quotes."quotedPostId"
      )
    RETURNING 1
  ),
  updated_quoted_quotes AS (
    UPDATE "quotes" AS quoted_quotes
    SET "quotedPostId" = :remotePostId, "updatedAt" = NOW()
    WHERE quoted_quotes."quotedPostId" = :existingPostId
      AND NOT EXISTS (
        SELECT 1
        FROM "quotes" AS existing_quoted_quotes
        WHERE existing_quoted_quotes."quotedPostId" = :remotePostId
      )
    RETURNING 1
  ),
  updated_remote_user_post_views AS (
    UPDATE "remoteUserPostViews" AS views
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE views."postId" = :existingPostId
      AND NOT EXISTS (
        SELECT 1
        FROM "remoteUserPostViews" AS existing_views
        WHERE existing_views."postId" = :remotePostId
          AND existing_views."userId" = views."userId"
      )
    RETURNING 1
  ),
  updated_silenced_posts AS (
    UPDATE "silencedPosts"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_user_bites AS (
    UPDATE "userBitesPostRelations"
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE "postId" = :existingPostId
    RETURNING 1
  ),
  updated_bookmarks AS (
    UPDATE "userBookmarkedPosts" AS bookmarks
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE bookmarks."postId" = :existingPostId
      AND NOT EXISTS (
        SELECT 1
        FROM "userBookmarkedPosts" AS existing_bookmarks
        WHERE existing_bookmarks."postId" = :remotePostId
          AND existing_bookmarks."userId" = bookmarks."userId"
      )
    RETURNING 1
  ),
  updated_likes AS (
    UPDATE "userLikesPostRelations" AS likes
    SET "postId" = :remotePostId, "updatedAt" = NOW()
    WHERE likes."postId" = :existingPostId
      AND NOT EXISTS (
        SELECT 1
        FROM "userLikesPostRelations" AS existing_likes
        WHERE existing_likes."postId" = :remotePostId
          AND existing_likes."userId" = likes."userId"
      )
    RETURNING 1
  )
  SELECT 1
`

async function getPostThreadRecursive(
  user: any,
  remotePostId: string | null,
  remotePostObject?: any,
  localPostToForceUpdate?: string,
  options?: any
) {
  let detachedQuote = false
  let detachedReply = false
  let parent: Post | undefined | null
  const replyControl: {
    replyControl: InteractionControlType
    likeControl: InteractionControlType
    reblogControl: InteractionControlType
    quoteControl: InteractionControlType
  } = {
    replyControl: InteractionControl.Anyone,
    likeControl: InteractionControl.Anyone,
    reblogControl: InteractionControl.Anyone,
    quoteControl: InteractionControl.Anyone
  }
  let bskyUri: string | undefined
  let bskyCid: string | undefined
  const checkBluesky = completeEnvironment.enableBsky && !options?.forceNotBsky
  if (remotePostId === null) return

  const deletedUser = getDeletedUser()
  try {
    remotePostId.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)
  } catch (error) {
    logger.info({
      message: 'Error with url on post',
      object: remotePostId,
      stack: new Error().stack
    })
    return
  }
  if (remotePostId.startsWith(`${completeEnvironment.frontendUrl}/fediverse/post/`)) {
    // we are looking at a local post
    const partToRemove = `${completeEnvironment.frontendUrl}/fediverse/post/`
    const postId = remotePostId.substring(partToRemove.length)
    return await Post.findOne({
      where: {
        id: postId
      }
    })
  }
  if (checkBluesky && remotePostId.startsWith('at://')) {
    // Bluesky post. Likely coming from an import
    const postInDatabase = await Post.findOne({
      where: {
        bskyUri: remotePostId
      }
    })
    if (postInDatabase) {
      return postInDatabase
    } else if (!remotePostObject) {
      const postId = await processSinglePost(remotePostId)
      return await Post.findByPk(postId)
    }
  }
  // fix bridgy duplicates. they are originaly bsky posts after all
  // TODO This function has other path for this. it would be nice to clean it up
  if (
    (checkBluesky && remotePostId.startsWith('https://bsky.brid.gy/')) ||
    remotePostId.startsWith('https://fed.brid.gy/r/')
  ) {
    // the post is a bsky one lol.
    let uri = remotePostId.split('https://bsky.brid.gy/convert/ap/')[1]
    if (remotePostId.startsWith('https://fed.brid.gy/r/')) {
      const profileAndPost = remotePostId.split('/profile/')[1].split('/post/')
      let bskyProfile = profileAndPost[0]
      bskyUri = profileAndPost[1]
      uri = `at://${bskyProfile}/app.bsky.feed.post/${bskyUri}`
    }
    if (uri) {
      const bskyVersionId = await processSinglePost(uri, false)
      if (bskyVersionId) {
        const bskyVersion = (await Post.findByPk(bskyVersionId)) as Post
        if (!bskyVersion.remotePostId && !(await getAllLocalUserIdsSet()).has(bskyVersion.userId)) {
          // we have the bsky post in the db, it is not from a local user
          const localPostWithExistingremoteId = await Post.findOne({
            where: {
              remotePostId: remotePostId
            }
          })
          if (localPostWithExistingremoteId && localPostWithExistingremoteId.id != bskyVersion.id) {
            // OK TIME TO UPDATE WHO IS PARENT OF DESCENDENTS
            await Post.update(
              {
                parentId: bskyVersion.id
              },
              {
                where: {
                  parentId: localPostWithExistingremoteId.id
                }
              }
            )
            localPostWithExistingremoteId.remotePostId = null
            localPostWithExistingremoteId.isDeleted = true
            await localPostWithExistingremoteId.save()
          }
          bskyVersion.remotePostId = remotePostId
          await bskyVersion.save()
        }
        return bskyVersion
      }
    }
  }
  const postInDatabase = await Post.findOne({
    where: {
      remotePostId: remotePostId
    }
  })
  if (postInDatabase && !localPostToForceUpdate) {
    if (postInDatabase.remotePostId) {
      const parentPostPetition = await getPetitionSigned(user, postInDatabase.remotePostId)
      if (parentPostPetition) {
        await loadPoll(parentPostPetition, postInDatabase, user)
      }
    }
    return postInDatabase
  } else {
    try {
      const postPetition = remotePostObject ? remotePostObject : await getPetitionSigned(user, remotePostId)
      if (postPetition && !localPostToForceUpdate) {
        const remotePostInDatabase = await Post.findOne({
          where: {
            remotePostId: postPetition.id
          }
        })
        if (postPetition.blueskyUri && checkBluesky) {
          try {
            const directPetition = await getAtprotoRecordDirect(postPetition.blueskyUri)
            if (directPetition && directPetition.value.fediverseId === postPetition.id) {
              bskyUri = postPetition.blueskyUri
              bskyCid = postPetition.blueskyCid
            }
          } catch (error) {}
        }
        if (remotePostInDatabase) {
          if (remotePostInDatabase.remotePostId) {
            const parentPostPetition = await getPetitionSigned(user, remotePostInDatabase.remotePostId)
            if (parentPostPetition) {
              await loadPoll(parentPostPetition, remotePostInDatabase, user)
            }
          }
          return remotePostInDatabase
        }
      }
      // peertube: what the fuck
      let actorUrl = postPetition.attributedTo
      if (Array.isArray(actorUrl)) {
        actorUrl = actorUrl[0].id
      }
      const remoteUser = await getRemoteActor(actorUrl, user)
      if (remoteUser) {
        const remoteHost = (await FederatedHost.findByPk(remoteUser.federatedHostId as string)) as FederatedHost
        const remoteUserServerBaned = remoteHost?.blocked ? remoteHost.blocked : false
        // HACK: some implementations (GTS IM LOOKING AT YOU) may send a single element instead of an array
        // I should had used a funciton instead of this dirty thing, BUT you see, its late. Im eepy
        // also this code is CRITICAL. A failure here is a big problem. So this hack it is
        postPetition.tag = !Array.isArray(postPetition.tag)
          ? [postPetition.tag].filter((elem) => elem)
          : postPetition.tag
        const medias: any[] = []
        const fediTags: fediverseTag[] = [
          ...new Set<fediverseTag>(
            postPetition.tag
              ?.filter((elem: fediverseTag) =>
                [
                  postPetition.tag.some((tag: fediverseTag) => tag.type == 'WafrnHashtag') ? 'WafrnHashtag' : 'Hashtag'
                ].includes(elem.type)
              )
              .map((elem: fediverseTag) => {
                return { href: elem.href, type: elem.type, name: elem.name }
              })
          )
        ]
        const invisibleMentionsToRemove = postPetition.tag?.find(
          (elem: fediverseTag) => elem.type === 'WafrnMentionsTextToHide'
        )
        let fediMentions: fediverseTag[] = postPetition.tag?.filter((elem: fediverseTag) => elem.type === 'Mention')
        if (fediMentions == undefined) {
          fediMentions = postPetition.to.map((elem: string) => {
            return { href: elem }
          })
        }
        let federatedAsks: fediverseTag[] = postPetition.tag?.filter(
          (elem: fediverseTag) => elem.type === 'AskQuestion'
        )

        const fediEmojis: any[] = postPetition.tag?.filter((elem: fediverseTag) => elem.type === 'Emoji')

        const privacy = getApObjectPrivacy(postPetition, remoteUser)
        // part of getting the canreply stuff
        if (postPetition.interactionPolicy) {
          const publicList = 'https://www.w3.org/ns/activitystreams#Public'
          const sameAsOpList = 'sameAsInitialPost'
          // canAnnounce
          if (postPetition.interactionPolicy.canAnnounce) {
            const autoListCanAnnounce = (postPetition.interactionPolicy?.canAnnounce?.always || []).concat(
              postPetition.interactionPolicy.canAnnounce.automaticApproval || []
            )
            const manualListCanAnnounce = postPetition.interactionPolicy.canAnnounce.manualApproval || []
            const listCanAnnounce = autoListCanAnnounce.concat(manualListCanAnnounce)
            const announceRequiresManualApproval =
              manualListCanAnnounce.length > 0 &&
              !autoListCanAnnounce.includes(publicList) &&
              !autoListCanAnnounce.includes(sameAsOpList)
            replyControl.reblogControl = InteractionControl.MentionedUsersOnly
            const followersCanReply = listCanAnnounce.includes(remoteUser.followersCollectionUrl)
            const followingCanReply = listCanAnnounce.includes(remoteUser.followingCollectionUrl)
            if (followersCanReply) {
              replyControl.reblogControl = followingCanReply
                ? InteractionControl.FollowersFollowingAndMentioned
                : InteractionControl.FollowersAndMentioned
            } else {
              replyControl.reblogControl = followingCanReply
                ? InteractionControl.FollowingAndMentioned
                : replyControl.reblogControl
            }
            if (listCanAnnounce.includes(publicList)) {
              replyControl.reblogControl = InteractionControl.Anyone
            }
            if (listCanAnnounce.includes(sameAsOpList)) {
              replyControl.reblogControl = InteractionControl.SameAsOp
            }
            if (announceRequiresManualApproval) {
              replyControl.reblogControl =
                AutomaticToManualApprovalEquivalent[replyControl.reblogControl] ?? replyControl.reblogControl
            }
          }

          if (postPetition.interactionPolicy.canLike) {
            const listCanLike = (postPetition.interactionPolicy.canLike.always || []).concat(
              postPetition.interactionPolicy.canLike.automaticApproval || []
            )
            replyControl.likeControl = InteractionControl.MentionedUsersOnly
            const followersCanReply = listCanLike.includes(remoteUser.followersCollectionUrl)
            const followingCanReply = listCanLike.includes(remoteUser.followingCollectionUrl)
            if (followersCanReply) {
              replyControl.likeControl = followingCanReply
                ? InteractionControl.FollowersFollowingAndMentioned
                : InteractionControl.FollowersAndMentioned
            } else {
              replyControl.likeControl = followingCanReply
                ? InteractionControl.FollowingAndMentioned
                : replyControl.likeControl
            }
            if (listCanLike.includes(publicList)) {
              replyControl.likeControl = InteractionControl.Anyone
            }
            if (listCanLike.includes(sameAsOpList)) {
              replyControl.likeControl = InteractionControl.SameAsOp
            }
          }

          if (postPetition.interactionPolicy.canReply) {
            const autoListCanReply = (postPetition.interactionPolicy.canReply.always || []).concat(
              postPetition.interactionPolicy.canReply.automaticApproval || []
            )
            const manualListCanReply = postPetition.interactionPolicy.canReply.manualApproval || []
            const listCanReply = autoListCanReply.concat(manualListCanReply)
            const replyRequiresManualApproval =
              manualListCanReply.length > 0 &&
              !autoListCanReply.includes(publicList) &&
              !autoListCanReply.includes(sameAsOpList)
            replyControl.replyControl = InteractionControl.MentionedUsersOnly
            const followersCanReply = listCanReply.includes(remoteUser.followersCollectionUrl)
            const followingCanReply = listCanReply.includes(remoteUser.followingCollectionUrl)
            if (followersCanReply) {
              replyControl.replyControl = followingCanReply
                ? InteractionControl.FollowersFollowingAndMentioned
                : InteractionControl.FollowersAndMentioned
            } else {
              replyControl.replyControl = followingCanReply
                ? InteractionControl.FollowingAndMentioned
                : replyControl.replyControl
            }
            if (listCanReply.includes(publicList)) {
              replyControl.replyControl = InteractionControl.Anyone
            }
            if (listCanReply.includes(sameAsOpList)) {
              replyControl.replyControl = InteractionControl.SameAsOp
            }
            if (replyRequiresManualApproval) {
              replyControl.replyControl =
                AutomaticToManualApprovalEquivalent[replyControl.replyControl] ?? replyControl.replyControl
            }
          }

          if (postPetition.interactionPolicy.canQuote) {
            const listCanQuote = (postPetition.interactionPolicy.canQuote.always || []).concat(
              postPetition.interactionPolicy.canQuote.automaticApproval || []
            )
            replyControl.quoteControl = InteractionControl.MentionedUsersOnly
            const followerscanQuote = listCanQuote.includes(remoteUser.followersCollectionUrl)
            const followingcanQuote = listCanQuote.includes(remoteUser.followingCollectionUrl)
            if (followerscanQuote) {
              replyControl.quoteControl = followingcanQuote
                ? InteractionControl.FollowersFollowingAndMentioned
                : InteractionControl.FollowersAndMentioned
            } else {
              replyControl.quoteControl = followingcanQuote
                ? InteractionControl.FollowingAndMentioned
                : replyControl.quoteControl
            }
            if (listCanQuote.includes(publicList)) {
              replyControl.quoteControl = InteractionControl.Anyone
            }
            if (listCanQuote.includes(sameAsOpList)) {
              replyControl.quoteControl = InteractionControl.SameAsOp
            }
          }
        }
        if (parent && parent.replyControl == InteractionControl.SameAsOp) {
          replyControl.replyControl = InteractionControl.SameAsOp
        } else if (parent) {
          // we check if op has property forceDescendentsToUseSameInteractionControls
          const opId = ((await Post.findByPk(parent.rootId as string)) as Post).remotePostId
          const opPostPetition = await getPetitionSigned(user, parent.remotePostId as string)
          if (opPostPetition && opPostPetition.forceDescendentsToUseSameInteractionControls == true) {
            replyControl.replyControl = InteractionControl.SameAsOp
          }
        }

        let { postTextContent, postLanguage } = processContentAndLanguage(postPetition)

        if (invisibleMentionsToRemove && postTextContent.startsWith(invisibleMentionsToRemove.name)) {
          postTextContent = postTextContent.substring(invisibleMentionsToRemove.name.length)
        }
        if (postPetition.type == 'Video') {
          // peertube federation. We just add a link to the video, federating this is HELL
          postTextContent = postTextContent + ` <a href="${postPetition.id}" target="_blank">${postPetition.id}</a>`
        }
        if (postPetition.tag && postPetition.tag.some((tag: fediverseTag) => tag.type === 'WafrnHashtag')) {
          // Ok we have wafrn hashtags with us, we are probably talking with another wafrn! Crazy, I know
          const dom = cheerio.load(postTextContent)
          const tags = dom('a.hashtag').html('')
          postTextContent = dom.html()
        }
        if (
          postPetition.attachment &&
          postPetition.attachment.length > 0 &&
          (!remoteUser.banned || options?.allowMediaFromBanned)
        ) {
          for await (const remoteFile of postPetition.attachment) {
            if (remoteFile.type !== 'Link') {
              const wafrnMedia = await Media.create({
                url: remoteFile.url,
                NSFW: postPetition?.sensitive,
                userId: remoteUserServerBaned || remoteUser.banned ? (await deletedUser)?.id : remoteUser.id,
                description: remoteFile.name,
                ipUpload: 'IMAGE_FROM_OTHER_FEDIVERSE_INSTANCE',
                mediaOrder: postPetition.attachment.indexOf(remoteFile), // could be non consecutive but its ok
                external: true,
                mediaType: remoteFile.mediaType ? remoteFile.mediaType : '',
                blurhash: remoteFile.blurhash ? remoteFile.blurhash : null,
                height: remoteFile.height ? remoteFile.height : null,
                width: remoteFile.width ? remoteFile.width : null
              })
              if (!wafrnMedia.mediaType || (wafrnMedia.mediaType?.startsWith('image') && !wafrnMedia.width)) {
                await updateMediaDataQueue.add(`updateMedia:${wafrnMedia.id}`, {
                  mediaId: wafrnMedia.id
                })
              }
              medias.push(wafrnMedia)
            } else {
              postTextContent = '' + postTextContent + `<a href="${remoteFile.href}" >${remoteFile.href}</a>`
            }
          }
        }
        if (!remoteUser.banned || options?.allowMediaFromBanned) {
          postTextContent = await extractMediaFromHtmlPost(
            postTextContent,
            medias,
            postPetition,
            remoteUserServerBaned || remoteUser.banned ? (await deletedUser)?.id : remoteUser.id
          )
        }
        const lemmyName = postPetition.name ? postPetition.name : ''
        postTextContent = postTextContent ? postTextContent : `<p>${lemmyName}</p>`
        let createdAt = new Date(postPetition.published)
        if (createdAt.getTime() > new Date().getTime()) {
          createdAt = new Date()
        }

        let existingBskyPost: Post | undefined
        // check if it's a bridgy post or a post from a wafrn by checking a valid FEP-fffd
        if (postPetition.url && Array.isArray(postPetition.url)) {
          const url = postPetition.url as Array<string | { type: string; href: string }>
          const firstFffd = url.find((x) => typeof x !== 'string')
          // check if it starts at at:// then its a bridged post, we do not touch it if it's not
          if (checkBluesky && firstFffd && firstFffd.href.startsWith('at://')) {
            // get it's bsky counterparts first, we need the cid
            const postBskyVersionId = await processSinglePost(firstFffd.href)
            const postBskyVersion = postBskyVersionId ? await Post.findByPk(postBskyVersionId) : undefined
            if (postBskyVersion) {
              bskyCid = postBskyVersion.bskyCid || undefined
              bskyUri = postBskyVersion.bskyUri || undefined
              const directPetition = await getAtprotoRecordDirect(bskyUri as string)
              if (directPetition && directPetition.value.fediverseId) {
                // This is a wafrn post
                // first we going to check if the post is already on db because this can break everything
                const existingFedi = await Post.findOne({
                  where: {
                    remotePostId: postPetition.id
                  }
                })
                if (existingFedi && existingFedi.id != postBskyVersion.id) {
                  existingFedi.remotePostId = null
                  await Post.update(
                    {
                      parentId: postBskyVersion.id
                    },
                    {
                      where: {
                        parentId: existingFedi.id
                      }
                    }
                  )
                  await existingFedi.save()
                }
                if (!postBskyVersion.remotePostId) {
                  postBskyVersion.remotePostId = postPetition.id
                  await postBskyVersion.save()
                }
                if (!localPostToForceUpdate) {
                  return postBskyVersion
                }
              } else {
                postBskyVersion.remotePostId = postPetition.id
                const existingFedi = await Post.findOne({
                  where: {
                    remotePostId: postPetition.id
                  }
                })
                if (existingFedi && postBskyVersion.id != existingFedi.id && existingFedi.remotePostId) {
                  if (existingFedi.remotePostId.startsWith('https://bsky.brid.gy/')) {
                    // the real post is the bsky one
                    existingFedi.remotePostId = null
                    existingFedi.isDeleted = true
                    await Post.update(
                      {
                        parentId: postBskyVersion.id
                      },
                      {
                        where: {
                          parentId: existingFedi.id
                        }
                      }
                    )
                    await existingFedi.save()
                    postBskyVersion.remotePostId = existingFedi.remotePostId
                    await postBskyVersion.save()
                    return postBskyVersion
                  } else {
                    // the real post is fedi one
                    existingFedi.bskyCid = postBskyVersion.bskyCid
                    existingFedi.bskyUri = postBskyVersion.bskyUri
                    postBskyVersion.bskyCid = null
                    postBskyVersion.bskyUri = null
                    postBskyVersion.isDeleted = true
                    await postBskyVersion.save()
                    await Post.update(
                      {
                        parentId: existingFedi.id
                      },
                      {
                        where: {
                          parentId: postBskyVersion.id
                        }
                      }
                    )
                    await existingFedi.save()
                    return existingFedi
                  }
                }
                return postBskyVersion
              }
            } else {
              if (!options.ignoreBridgyRepeat) {
                const processSinglePostQueue = getQueue('processSinglePost')
                processSinglePostQueue.add('processSinglePost', { post: firstFffd.href, forceUpdate: false })
                const processFediPostQueue = getQueue('processFediPostQueue')
                processFediPostQueue.add('processSinglePost', { post: remotePostId }, { delay: 1000 })
              }
            }
          }
        }

        const postToCreate: any = {
          content: '' + postTextContent,
          content_warning: postPetition.summary
            ? postPetition.summary
            : remoteUser.NSFW
              ? 'User is marked as NSFW by this instance staff. Possible NSFW without tagging'
              : '',
          createdAt: createdAt,
          updatedAt: createdAt,
          userId: remoteUserServerBaned || remoteUser.banned ? (await deletedUser)?.id : remoteUser.id,
          remotePostId: postPetition.id,
          privacy: privacy,
          bskyUri: postPetition.blueskyUri,
          displayUrl: Array.isArray(postPetition.url) ? postPetition.url[0] : postPetition.url,
          bskyCid: postPetition.blueskyCid,
          ...(bskyCid && bskyUri
            ? {
                bskyCid,
                bskyUri
              }
            : {}),
          ...replyControl,
          language: postLanguage
        }

        if (postPetition.name) {
          postToCreate.title = postPetition.name
        }

        const mentionedUsersIds: string[] = []
        const quotes: any[] = []
        try {
          if (!remoteUser.banned && !remoteUserServerBaned) {
            for await (const mention of fediMentions) {
              let mentionedUser = await getRemoteActor(mention.href, user)
              if (mention.href?.indexOf(completeEnvironment.frontendUrl) !== -1) {
                const username = mention.href?.substring(
                  `${completeEnvironment.frontendUrl}/fediverse/blog/`.length
                ) as string
                mentionedUser = await User.findOne({
                  where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), username.toLowerCase())
                })
              } else {
                mentionedUser = await getRemoteActor(mention.href, user)
              }
              if (
                mentionedUser?.id &&
                mentionedUser.id != (await deletedUser)?.id &&
                !mentionedUsersIds.includes(mentionedUser.id)
              ) {
                mentionedUsersIds.push(mentionedUser.id)
              }
            }
          }
        } catch (error) {
          logger.info({ message: 'problem processing mentions', error })
        }

        if (postPetition.inReplyTo && postPetition.id !== postPetition.inReplyTo) {
          parent = await getPostThreadRecursive(
            user,
            postPetition.inReplyTo.id ? postPetition.inReplyTo.id : postPetition.inReplyTo
          )
          postToCreate.isReply = parent ? parent.isReply || parent.userId != postToCreate.userId : false
          postToCreate.isBskyExclusive = false
          postToCreate.parentId = parent?.id
          postToCreate.rootId = parent?.rootId
        }

        const existingPost = localPostToForceUpdate ? await Post.findByPk(localPostToForceUpdate) : undefined

        if (existingPost) {
          existingPost.set(postToCreate)
          await existingPost.save()
          await loadPoll(postPetition, existingPost, user)
        }

        const newPost = existingPost ? existingPost : await Post.create(postToCreate)
        try {
          if (!remoteUser.banned && !remoteUserServerBaned && fediEmojis) {
            processEmojis(newPost, fediEmojis)
          }
        } catch (error) {
          logger.debug('Problem processing emojis')
        }
        newPost.setMedias(medias)
        try {
          if (
            postPetition.quote ||
            postPetition.quoteUrl ||
            postPetition.tag?.filter((elem: fediverseTag) => elem.type === 'BskyQuote')?.length
          ) {
            const urlQuote = postPetition.quoteUrl || postPetition.quote
            const postToQuote = await getPostThreadRecursive(user, urlQuote)
            if (postToQuote && postToQuote.privacy != Privacy.DirectMessage) {
              quotes.push(postToQuote)
            }
            if (!postToQuote) {
              postToCreate.content = postToCreate.content + `<p>RE: ${urlQuote}</p>`
            }
            const postsToQuotePromise: any[] = []
            if (completeEnvironment.enableBsky) {
              postPetition.tag
                ?.filter((elem: fediverseTag) => elem.type === 'BskyQuote')
                .forEach((quote: fediverseTag) => {
                  postsToQuotePromise.push(processSinglePost(quote.href as string))
                  postToCreate.content = postToCreate.content.replace(quote.name, '')
                })
            }
            postPetition.tag
              ?.filter((elem: fediverseTag) => elem.type === 'Link')
              .forEach((quote: fediverseTag) => {
                postsToQuotePromise.push(getPostThreadRecursive(user, quote.href as string))
                postToCreate.content = postToCreate.content.replace(quote.name, '')
              })
            const quotesToAdd = await Promise.allSettled(postsToQuotePromise)
            const quotesThatWillGetAdded = quotesToAdd.filter(
              (elem) => elem.status === 'fulfilled' && elem.value && elem.value.privacy !== 10
            )
            quotesThatWillGetAdded.forEach((quot) => {
              if (quot.status === 'fulfilled' && !quotes.map((q) => q.id).includes(quot.value.id)) {
                quotes.push(quot.value)
              }
            })
          }
        } catch (error) {
          logger.info('Error processing quotes')
          logger.debug(error)
        }
        newPost.setQuoted(quotes)

        try {
          if (federatedAsks && federatedAsks.length) {
            await Ask.destroy({
              where: {
                postId: newPost.id
              }
            })
            const askTag = federatedAsks[0] // only first ask sorryyy
            if (askTag.actor && askTag.representation && askTag.name) {
              const asker = askTag.actor != 'anonymous' ? await getRemoteActor(askTag.actor, user) : undefined
              const askText = askTag.name
              const htmlToRemove = askTag.representation
              await Ask.create({
                postId: newPost.id,
                userAsked: newPost.userId,
                userAsker: asker?.id,
                question: escapeHTML(askText)
              })
              newPost.content = newPost.content.replace(htmlToRemove, '')
            }
          }
        } catch (error) {
          logger.info({
            message: `Error setting wafrn ask`,
            error: error
          })
        }

        await newPost.save()
        const postsBeingQuotedIds = quotes.map((elem) => elem.quotedPostId)
        const postsQuoteds = await Post.findAll({
          where: {
            id: {
              [Op.in]: postsBeingQuotedIds
            }
          }
        })
        detachedQuote = postsQuoteds.some(
          async (elem) => !(await canInteract(elem.quoteControl, newPost.userId, elem.id))
        )
        await bulkCreateNotifications(
          quotes.map((quote) => ({
            notificationType: 'QUOTE',
            notifiedUserId: quote.userId,
            userId: newPost.userId,
            postId: newPost.id,
            createdAt: new Date(newPost.createdAt),
            detached: detachedQuote
          })),
          {
            postContent: newPost.content,
            userUrl: remoteUser.url
          }
        )
        try {
          if (!remoteUser.banned && !remoteUserServerBaned) {
            await addTagsToPost(newPost, fediTags)
          }
        } catch (error) {
          logger.info('problem processing tags')
        }
        try {
          await addAsksToPost(newPost, fediTags)
        } catch (error) {}
        // check if detached
        if (parent?.detached) {
          detachedReply = true
        }
        if (!detachedReply && parent && (await getAllLocalUserIdsSet()).has(parent.userId)) {
          detachedReply = !(await canInteract(parent.replyControl, newPost.userId, parent.id))
        }
        if (detachedReply) {
          newPost.detached = true
          await newPost.save()
        }
        await processMentions(newPost, mentionedUsersIds, detachedReply)
        await loadPoll(remotePostObject, newPost, user)
        const postCleanContent = dompurify.sanitize(newPost.content, { ALLOWED_TAGS: [] }).trim()
        const mentions = await newPost.getMentionPost()
        if (postCleanContent.startsWith('!ask') && mentions.length === 1) {
          let askContent = postCleanContent.substring(`!ask @${mentions[0].url}`.length)
          if (askContent.startsWith('@' + completeEnvironment.instanceUrl)) {
            askContent = askContent.split('@' + completeEnvironment.instanceUrl)[1]
          }
          const sanitizedAskContent = dompurify.sanitize(askContent, { ALLOWED_TAGS: [] })
          await Ask.create({
            question: sanitizedAskContent,
            userAsker: newPost.userId,
            userAsked: mentions[0].id,
            answered: false,
            apObject: JSON.stringify(postPetition)
          })
          await createNotification(
            {
              notificationType: 'ASK',
              userId: newPost.userId,
              notifiedUserId: mentions[0].id,
              detached: false
            },
            {
              userUrl: remoteUser.url,
              postContent: sanitizedAskContent
            }
          )
        }

        if (existingBskyPost) {
          newPost.bskyCid = existingBskyPost.bskyCid
          newPost.bskyUri = existingBskyPost.bskyUri

          await sequelize.transaction(async (transaction) => {
            await sequelize.query(mergeBskyPostRelatedRecordsSql, {
              replacements: {
                existingPostId: existingBskyPost.id,
                remotePostId: newPost.id
              },
              transaction
            })
            await Post.update(
              {
                parentId: newPost.id
              },
              {
                where: {
                  parentId: existingBskyPost.id
                },
                transaction
              }
            )

            await existingBskyPost.destroy({ transaction })
            await newPost.save({ transaction })
          })
        }

        return newPost
      }
    } catch (error) {
      logger.trace({
        message: 'error getting remote post',
        url: remotePostId,
        user: user.url,
        problem: error
      })
      return null
    }
  }
}

async function addAsksToPost(post: Post, tags: fediverseTag[]) {
  const asks = tags.filter((elem) => elem.type === 'AskQuestion')
  if (asks.length) {
    const ask = asks[0]
    const userAsker = await getRemoteActor(ask.actor as string, await getAdminUser())
    const textToRemove = ask.representation as string
    const askText = ask.name
    if (textToRemove) {
      post.content = post.content.replace(textToRemove, '')
      await Ask.create({
        answered: true,
        postId: post.id,
        userAsker: userAsker ? userAsker.id : undefined,
        userAsked: post.userId
      })
      await post.save()
    }
  }
}

async function addTagsToPost(post: any, originalTags: fediverseTag[]) {
  let tags = [...originalTags]
  const res = await post.setPostTags([])
  if (tags.some((elem) => elem.name == 'WafrnHashtag')) {
    tags = tags.filter((elem) => elem.name == 'WafrnHashtag')
  }
  return await PostTag.bulkCreate(
    tags
      .filter((elem) => elem && post && elem.name && post.id)
      .map((elem) => {
        return {
          tagName: elem?.name?.replace('#', ''),
          postId: post.id
        }
      })
  )
}

async function processMentions(post: any, userIds: string[], detached: boolean) {
  await post.setMentionPost([])
  await Notification.destroy({
    where: {
      notificationType: 'MENTION',
      postId: post.id
    }
  })
  const blocks = await Blocks.findAll({
    where: {
      blockerId: {
        [Op.in]: userIds
      },
      blockedId: post.userId
    }
  })
  const remoteUser = await User.findByPk(post.userId, {
    attributes: ['url', 'federatedHostId']
  })
  const userServerBlocks = await ServerBlock.findAll({
    where: {
      userBlockerId: {
        [Op.in]: userIds
      },
      blockedServerId: remoteUser?.federatedHostId || ''
    }
  })
  const blockerIds: string[] = blocks
    .map((block: any) => block.blockerId)
    .concat(userServerBlocks.map((elem: any) => elem.userBlockerId))

  await bulkCreateNotifications(
    userIds.map((mentionedUserId) => ({
      notificationType: 'MENTION',
      notifiedUserId: mentionedUserId,
      userId: post.userId,
      postId: post.id,
      createdAt: new Date(post.createdAt),
      detached: detached
    })),
    {
      postContent: post.content,
      userUrl: remoteUser?.url
    }
  )

  return await PostMentionsUserRelation.bulkCreate(
    userIds
      .filter((elem) => !blockerIds.includes(elem))
      .map((elem) => {
        return {
          postId: post.id,
          userId: elem
        }
      }),
    {
      ignoreDuplicates: true
    }
  )
}

async function processEmojis(post: any, fediEmojis: any[]) {
  let emojis: any[] = []
  let res: any
  const emojiIds: string[] = Array.from(new Set(fediEmojis.map((emoji: any) => emoji.id)))
  const foundEmojis = await Emoji.findAll({
    where: {
      id: {
        [Op.in]: emojiIds
      }
    }
  })
  foundEmojis.forEach((emoji: any) => {
    const newData = fediEmojis.find((foundEmoji: any) => foundEmoji.id === emoji.id)
    if (newData && newData.icon?.url) {
      emoji.set({
        url: newData.icon.url
      })
      emoji.save()
    } else {
      logger.debug('issue with emoji')
      logger.debug(emoji)
      logger.debug(newData)
    }
  })
  emojis = emojis.concat(foundEmojis)
  const notFoundEmojis = fediEmojis.filter((elem: any) => !foundEmojis.find((found: any) => found.id === elem.id))
  if (fediEmojis && notFoundEmojis && notFoundEmojis.length > 0) {
    try {
      const newEmojis = notFoundEmojis.map((newEmoji: any) => {
        return {
          id: newEmoji.id ? newEmoji.id : newEmoji.name + newEmoji.icon?.url,
          name: newEmoji.name,
          external: true,
          url: newEmoji.icon?.url
        }
      })
      emojis = emojis.concat(await Emoji.bulkCreate(newEmojis, { ignoreDuplicates: true }))
    } catch (error) {
      logger.debug('Error with emojis')
      logger.debug(error)
    }
  }

  return await post.setEmojis(emojis)
}

/**
 * Checks if activity object contains `contentMap`.
 *
 * Returns the content and language from the `contentMap` if
 *   - there's only one language property
 *   - language is present in utils/languages.ts
 * @param postPetition
 * @returns content and language code
 */
function processContentAndLanguage(postPetition: any): { postTextContent: string; postLanguage: string | undefined } {
  const contentMap = postPetition.contentMap

  if (typeof contentMap == 'object') {
    const keys = Object.keys(contentMap)

    if (keys.length == 1) {
      const language = filterLanguageCode(keys[0])

      if (language) {
        return {
          postTextContent: postPetition.contentMap[keys[0]] || '',
          postLanguage: language
        }
      }
    }
  }

  return {
    postTextContent: postPetition.content || '',
    postLanguage: undefined
  }
}

export { getPostThreadRecursive }
