import {
  Media,
  Notification,
  Post,
  PostMentionsUserRelation,
  PostTag,
  Quotes,
  sequelize,
  User
} from '../../models/index.js'
import { Op, QueryTypes } from 'sequelize'
import { getAtprotoUser } from './getAtprotoUser.js'
import { logger } from '../../utils/logger.js'
import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedRecordWithMedia,
  AppBskyEmbedVideo,
  AppBskyFeedPost,
  AppBskyRichtextFacet,
  ComAtprotoLabelDefs,
  ComAtprotoRepoGetRecord,
  Label,
  RichText
} from '@atproto/api'
import { bulkCreateNotifications, createNotification } from '../../utils/pushNotifications.js'
import { getAllLocalUserIds, getAllLocalUserIdsSet } from '../../utils/cacheGetters/getAllLocalUserIds.js'
import { InteractionControl, InteractionControlType, Privacy } from '../../models/post.js'
import { wait } from '../../utils/wait.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { MediaAttributes } from '../../models/media.js'
import { getPostThreadRecursive } from '../../utils/activitypub/getPostThreadRecursive.js'
import { Queue } from 'bullmq'
import { getAdminUser } from '../../utils/getAdminAndDeletedUser.js'
import { getServerFromDid } from '../../utils/atproto/getServerFromDid.js'
import { getDidDoc } from '../../utils/atproto/getDidDoc.js'
import { DidDocument } from '@atcute/identity'
import { extractUriComponents } from './obtainUriComponents.js'
import { getPetitionSigned } from '../../utils/activitypub/getPetitionSigned.js'
import getUserAgent from '../../utils/getUserAgent.js'
import { getQueue } from '../../utils/queues.js'
import { filterLanguageCode } from '../../utils/languages.js'

const processSinglePostQueue = getQueue('processSinglePost')

const mergeRemotePostRelatedRecordsSql = `
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

// returns the post id
async function processSinglePost(uri: string, forceUpdate = false): Promise<string | undefined> {
  let detached = false
  if (!completeEnvironment.enableBsky) {
    return undefined
  }
  if (!forceUpdate) {
    const existingPost = await Post.findOne({
      where: {
        bskyUri: uri
      }
    })
    if (existingPost && !forceUpdate) {
      return existingPost.id
    }
  }
  let postCreator: User | undefined
  try {
    const did = extractUriComponents(uri).did
    const existingCreator = await User.findOne({
      where: {
        bskyDid: did
      }
    })
    try {
      const doc = (await getDidDoc(did)) as DidDocument
      const handle = (doc.alsoKnownAs as string[]).filter((elem) => elem.startsWith('at://'))[0].split('at://')[1]
      postCreator = await getAtprotoUser(handle)
    } catch (error) {
      postCreator = existingCreator || undefined
      logger.info({
        message: `Problem obtaining bsky user ${did}`,
        error: error
      })
    }
  } catch (error) {
    logger.debug({
      message: `Problem obtaining user from post`,
      uri,
      forceUpdate,
      error: error
    })
  }
  let verifiedFedi: string | undefined
  const postPetitionPds = await getPostThreadPDSDirect(uri)
  if (!postPetitionPds) {
    return;
  }
  const post = postPetitionPds?.value as AppBskyFeedPost.Main
  const parentUri = post?.reply?.parent?.uri ? post.reply.parent.uri : undefined
  let parentId: string | undefined = undefined
  try {
    if (parentUri) {
      parentId = await processSinglePost(parentUri, false)
    }
  } catch (error) {
    logger.debug({
      error,
      message: `Problem obtaining parent bsky: post ${uri} parent ${parentUri}`
    })
  }
  if (
    postPetitionPds &&
    postPetitionPds.value &&
    ('fediverseId' in postPetitionPds.value || 'bridgyOriginalUrl' in postPetitionPds.value)
  ) {
    // original is fedi. lets wait half second
    if ('bridgyOriginalUrl' in postPetitionPds.value) {
      const res = await fetch(
        completeEnvironment.bskySlingshotUrl +
        '/xrpc/com.bad-example.identity.resolveMiniDoc' +
        `?identifier=${extractUriComponents(uri).did}`
      )
      if (res.ok) {
        const json = (await res.json()) as { pds: string }
        if (
          json.pds
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .startsWith('atproto.brid.gy')
        ) {
          // if user is on bridgy pds, verify it
          verifiedFedi = postPetitionPds.value.bridgyOriginalUrl as string
        }
      }
    } else {
      // prob wafrn post, but lets verify it
      try {
        const id = postPetitionPds.value.fediverseId as string
        const fediPostObject = await getPetitionSigned(await getAdminUser(), id)
        if (
          fediPostObject &&
          fediPostObject.blueskyUri &&
          postPetitionPds.uri == fediPostObject.blueskyUri &&
          fediPostObject.blueskyCid &&
          postPetitionPds.cid == fediPostObject.blueskyCid
        ) {
          // the post is real and they point each other.
          verifiedFedi = id
        }
      } catch (error) {
        logger.debug({
          error,
          message: `Error in obtaining fedi post ${postPetitionPds.value.fediverseId}`
        })
      }
    }
  }
  if (verifiedFedi) {
    try {
      const remotePostV0 = await getPostThreadRecursive(await getAdminUser(), verifiedFedi, undefined, undefined, {
        forceNotBsky: true,
        forceUpdate: true
      })
      const remotePost = await getPostThreadRecursive(await getAdminUser(), verifiedFedi, undefined, remotePostV0?.id, {
        forceNotBsky: true,
        forceUpdate: true
      })

      const bskyCid = postPetitionPds!.cid as string
      const bskyUri = postPetitionPds!.uri
      if (remotePost && remotePost.remotePostId) {
        remotePost.bskyCid = bskyCid
        remotePost.bskyUri = bskyUri
        if (forceUpdate) {
          await processReplies(remotePost.bskyUri as string)
        }
        await remotePost.save()
        return remotePost.id
      } else if (remotePost) {
        // HERE?
        remotePost.bskyCid = bskyCid
        remotePost.bskyUri = bskyUri
        // if there's already a bsky post about
        // this that doesn't have any fedi urls, delete it
        // and prob update the things
        const existingPost = await Post.findOne({
          where: {
            bskyUri: bskyUri,
            remotePostId: null
          }
        })
        if (existingPost) {
          const localUserIds = await getAllLocalUserIds()
          if (await User.scope('full').count({
            where: {
              id: existingPost.userId,
              email: {
                [Op.not]: null
              }
            }
          })) {
            await remotePost.save()
          } else {
            // Converted to a super single query
            await sequelize.transaction(async (transaction) => {
              await sequelize.query(mergeRemotePostRelatedRecordsSql, {
                replacements: {
                  existingPostId: existingPost.id,
                  remotePostId: remotePost.id
                },
                transaction
              })

              await Post.update({
                parentId: remotePost.id,
              }, {
                where: {
                  parentId: existingPost.id,
                },
                transaction
              })

              await Post.update({
                isDeleted: true,
              }, {
                where: {
                  bskyCid: bskyCid,
                  remotePostId: null,
                  userId: {
                    [Op.notIn]: localUserIds
                  }
                },
                transaction
              })

              await remotePost.save({ transaction })
            })
          }
        } else {
          await remotePost.save()
        }
        if (forceUpdate) {
          await processReplies(remotePost.bskyUri as string)
        }
        return remotePost.id
      }
    } catch (error) {
      logger.debug({
        message: `Error in obtaining fedi post ${verifiedFedi}`,
        error
      })
    }
  }
  if (!postCreator || !postPetitionPds) {
    return undefined
  }
  if (postCreator && post) {
    const medias = getPostMedias(postPetitionPds.uri, post)
    let tags: string[] = []
    let mentions: string[] = []
    let postText = post.text || ''
    let federatedWoot = false
    if (post.fullText || post.bridgyOriginalText) {
      federatedWoot = true
      tags = (post.fullTags as string)?.split('\n').filter((x: string) => !!x) ?? [] // also detect full tags
      postText = (post.fullText as string) ?? (post.bridgyOriginalText as string)
    }
    if (post.facets && post.facets.length > 0) {
      // lets get mentions
      const mentionedDids = post.facets
        .flatMap((elem) => elem.features)
        .map((elem) => (elem as AppBskyRichtextFacet.Mention).did)
        .filter((elem) => elem)
      if (mentionedDids && mentionedDids.length > 0) {
        const mentionedUsers = await User.findAll({
          where: {
            bskyDid: {
              [Op.in]: mentionedDids
            }
          }
        })
        mentions = mentionedUsers.map((elem) => elem.id)
      }
      if (!federatedWoot) {
        const rt = new RichText({
          text: postText,
          facets: post.facets
        })
        let text = ''

        for (const segment of rt.segments()) {
          if (segment.isLink()) {
            const href = segment.link?.uri
            text += `<a href="${href}" target="_blank">${href}</a>`
          } else if (segment.isMention()) {
            const href = `${completeEnvironment.frontendUrl}/blog/${segment.mention?.did}`
            text += `<a href="${href}" target="_blank">${segment.text}</a>`
          } else if (segment.isTag()) {
            const href = `${completeEnvironment.frontendUrl}/dashboard/search/${segment.text.substring(1)}`
            text += `<a href="${href}" target="_blank">${segment.text}</a>`
            tags.push(segment.text.substring(1))
          } else {
            text += segment.text
          }
        }
        postText = text
      }

    }

    if (!federatedWoot) {
      postText = postText ? postText.replaceAll('\n', '<br>') : ''
    }

    const labels = getPostLabels(postPetitionPds.value as AppBskyFeedPost.Main)
    let cw = labels.length > 0 ? `Post is labeled as: ${labels.join(', ')}` : undefined
    if (!cw && postCreator.NSFW) {
      cw = 'This user has been marked as NSFW and the post has been labeled automatically as NSFW'
    }

    let createdAt = new Date(post.createdAt)
    if (createdAt.getTime() > new Date().getTime()) {
      createdAt = new Date()
    }

    let isReply = false;
    if (parentId) {
      const parentPost = (await Post.findByPk(parentId)) as Post
      isReply = parentPost.isReply || parentPost.userId != postCreator.id;
    }

    const postLanguage = getPostLanguage(post);

    const newData = {
      userId: postCreator.id,
      bskyCid: postPetitionPds.cid,
      bskyUri: postPetitionPds.uri,
      content: postText,
      createdAt: createdAt,
      privacy: Privacy.Public,
      parentId: parentId,
      content_warning: cw,
      ...(await getPostInteractionLevels(uri, parentId)),
      isBskyExclusive: true, // TODO hmmm
      isReply: isReply,
      language: postLanguage,
    }
    if (!parentId) {
      delete newData.parentId
    }

    if ((await getAllLocalUserIdsSet()).has(newData.userId) && !forceUpdate && postCreator.bskyDid) {

      const userPds = await getServerFromDid(postCreator.bskyDid, true)
      if (`https://${completeEnvironment.bskyPds}`.toLowerCase() != userPds) {
        // OH SHIT THIS USER IS NO LONGER IN WAFRN
        const oldDid = postCreator.bskyDid
        postCreator.bskyDid = null;
        postCreator.enableBsky = false;
        postCreator.alternateUrl = undefined
        await postCreator.save();
        postCreator = await getAtprotoUser(oldDid, { ignoreCache: true })
      } else {
        // await wait(1500)
      }
    }
    const [postToProcess, created] = await Post.findOrCreate({
      where: { bskyUri: postPetitionPds.uri },
      defaults: newData
    })
    // some linting issues sorry this one could be in other place but the linter complains about other part of the code (npm run type-check)
    if (!postCreator) {
      return;
    }
    // do not update existing posts. But what if local user creates a post through bsky? then we force updte i guess
    if (!(await getAllLocalUserIdsSet()).has(postToProcess.userId) || created) {
      if (!created) {
        postToProcess.set(newData)
        await postToProcess.save()
      }
      if (medias) {
        await Media.destroy({
          where: {
            postId: postToProcess.id
          }
        })
        await Media.bulkCreate(
          medias.map((media) => {
            return { ...media, postId: postToProcess.id }
          })
        )
      }
      if (parentId) {
        const ancestors = await sequelize.query(
          `
  WITH RECURSIVE ancestors AS (
    SELECT id, "parentId", "hierarchyLevel", "userId"
    FROM posts
    WHERE id = :postId
    UNION ALL
    SELECT p.id, p."parentId", p."hierarchyLevel", p."userId"
    FROM posts p
    INNER JOIN ancestors a ON p.id = a."parentId"
  )
  SELECT "userId"
  FROM ancestors
  WHERE "hierarchyLevel" > :minLevel
  ORDER BY "hierarchyLevel" DESC
  `,
          {
            replacements: {
              postId: postToProcess.id,
              minLevel: postToProcess.hierarchyLevel - 5
            },
            type: QueryTypes.SELECT
          }
        ) as Array<{ userId: string }>

        mentions = mentions.concat(ancestors.map((elem) => elem.userId))
      }
      mentions = [...new Set(mentions)]
      if (mentions.length > 0) {
        await Notification.destroy({
          where: {
            notificationType: 'MENTION',
            postId: postToProcess.id
          }
        })
        await PostMentionsUserRelation.destroy({
          where: {
            postId: postToProcess.id
          }
        })
        await bulkCreateNotifications(
          mentions.map((mnt) => ({
            notificationType: 'MENTION',
            postId: postToProcess.id,
            notifiedUserId: mnt,
            userId: postToProcess.userId,
            createdAt: new Date(postToProcess.createdAt),
            detached: detached
          })),
          {
            ignoreDuplicates: true,
            postContent: postText,
            userUrl: postCreator.url
          }
        )
        await PostMentionsUserRelation.bulkCreate(
          mentions.map((mnt) => {
            return {
              userId: mnt,
              postId: postToProcess.id
            }
          }),
          { ignoreDuplicates: true }
        )
      }
      if (tags.length > 0) {
        await PostTag.destroy({
          where: {
            postId: postToProcess.id
          }
        })
        await PostTag.bulkCreate(
          tags.map((tag) => {
            return {
              postId: postToProcess.id,
              tagName: tag
            }
          })
        )
      }
      const quotedPostUri = getQuotedPostUri(postPetitionPds)
      if (quotedPostUri) {
        const quotedPostId = await processSinglePost(quotedPostUri, forceUpdate)
        if (quotedPostId) {
          const quotedPost = await Post.findByPk(quotedPostId)
          if (quotedPost) {
            await createNotification(
              {
                notificationType: 'QUOTE',
                notifiedUserId: quotedPost.userId,
                userId: postToProcess.userId,
                postId: postToProcess.id,
                detached: false
              },
              {
                postContent: postToProcess.content,
                userUrl: postCreator?.url
              }
            )
            await Quotes.findOrCreate({
              where: {
                quoterPostId: postToProcess.id,
                quotedPostId: quotedPostId
              }
            })
          }
        }
      }
    }
    if (forceUpdate) {
      await processReplies(postToProcess.bskyUri as string)
    }
    return postToProcess.id
  } else {

    if (!postPetitionPds) {
      logger.error({
        message: `Error obtaining user: ${uri}`,
        error: {
          postCreator: postCreator,
          post: post
        }
      })
      throw new Error(`Error obtaining user: ${uri}`)
    }
  }
}

function getPostMedias(uri: string, post: AppBskyFeedPost.Main) {
  let res: MediaAttributes[] = []
  const embed = post?.embed
  if (embed) {
    // NOTE: embed is only RecordWithMedia for the cases of quote + media
    if ((embed as AppBskyEmbedRecordWithMedia.Main).media) {
      // NOTE: media inside RecordWithMedia is the same type as embed inside post
      const media = (embed as AppBskyEmbedRecordWithMedia.Main).media
      const parsed = parsePostEmbed(uri, media)
      if (parsed) {
        res = res.concat(parsed)
      } else {
        logger.debug({
          message: `Bsky problem getting medias on post ${uri}`
        })
      }
    } else {
      const parsed = parsePostEmbed(uri, embed)
      if (parsed) {
        res = res.concat(parsed)
      } else {
        logger.debug({
          message: `Bsky problem getting medias on post ${uri}`
        })
      }
    }
  }

  const labels = getPostLabels(post)
  return res.map((m) => {
    return {
      ...m,
      NSFW: labels.length > 0
    }
  })
}

function parsePostEmbed(postUri: string, embed: AppBskyFeedPost.Main['embed']) {
  const { did } = extractUriComponents(postUri)
  if ((embed as AppBskyEmbedExternal.Main).external) {
    const external = (embed as AppBskyEmbedExternal.Main).external
    return {
      mediaType: (external.uri.startsWith('https://media.tenor.com/') || external.uri.startsWith('https://static.klipy.com/')) ? 'image/gif' : 'text/html',
      description: external.title,
      url: external.uri,
      mediaOrder: 0,
      external: true
    }
  }
  if ((embed as AppBskyEmbedImages.Main).images) {
    const images = (embed as AppBskyEmbedImages.Main).images
    const toConcat = images.map((media, index) => {
      const cid = media.image.ref['$link'] ? media.image.ref['$link'] : media.image.ref.toString()
      return {
        mediaType: media.image.mimeType,
        description: media.alt,
        height: media.aspectRatio?.height,
        width: media.aspectRatio?.width,
        url: `?cid=${encodeURIComponent(cid)}&did=${encodeURIComponent(did)}`,
        mediaOrder: index,
        external: true
      }
    })
    return toConcat
  }
  // gallery embed (multiple images, new style for 5-10 images)
  if ((embed as any)['$type'] === 'app.bsky.embed.gallery' || (embed as any).items) {
    const items = (embed as any).items as Array<any>
    const toConcat = items.map((item, index) => {
      // item is of type app.bsky.embed.gallery#image
      const image = item.image
      const cid = image.ref['$link'] ? image.ref['$link'] : image.ref.toString()
      return {
        mediaType: image.mimeType,
        description: item.alt,
        height: item.aspectRatio?.height,
        width: item.aspectRatio?.width,
        url: `?cid=${encodeURIComponent(cid)}&did=${encodeURIComponent(did)}`,
        mediaOrder: index,
        external: true
      }
    })
    return toConcat
  }
  if ((embed as AppBskyEmbedVideo.Main).video) {
    const { video, aspectRatio, alt } = embed as AppBskyEmbedVideo.Main
    const cid = video.ref['$link'] ? video.ref['$link'] : video.ref.toString()
    return {
      mediaType: video.mimeType,
      description: alt ?? '',
      height: aspectRatio?.height,
      width: aspectRatio?.width,
      url: `?cid=${encodeURIComponent(cid)}&did=${encodeURIComponent(did)}`,
      mediaOrder: 0,
      external: true
    }
  }
  return null
}

// TODO improve this so we get better nsfw messages lol
function getPostLabels(post: AppBskyFeedPost.Main) {
  const labels = new Set<string>()
  if (ComAtprotoLabelDefs.isSelfLabels(post.labels)) {
    for (const label of post.labels.values) {
      if ((label as Label).neg && labels.has(label.val)) {
        labels.delete(label.val)
      } else {
        labels.add(label.val)
      }
    }
  }
  return Array.from(labels)
}

async function getPostInteractionLevels(
  uri: string,
  parentId: string | undefined
): Promise<{
  replyControl: InteractionControlType
  likeControl: InteractionControlType
  reblogControl: InteractionControlType
  quoteControl: InteractionControlType
}> {
  let canQuote = InteractionControl.Anyone
  let canReply: InteractionControlType = InteractionControl.Anyone
  const { did, collection, rKey } = extractUriComponents(uri)
  const [threadGate, postGate] = await Promise.all([
    getPostThreadPDSDirect(`at://${did}/app.bsky.feed.threadgate/${rKey}`),
    getPostThreadPDSDirect(`at://${did}/app.bsky.feed.postgate/${rKey}`)
  ])

  if (postGate && (postGate as any).value?.embeddingRules.length) {
    canQuote = InteractionControl.NoOne
  }
  const parent = parentId ? ((await Post.findByPk(parentId)) as Post) : undefined
  if (parent && (!parent.remotePostId || parent.remotePostId?.startsWith('https://bsky.brid.gy/'))) {
    canReply = InteractionControl.SameAsOp
    canQuote = InteractionControl.SameAsOp
  } else if (threadGate?.value && (threadGate.value as any).allow) {
    const allowList = (threadGate.value as any).allow
    if (allowList.length == 0) {
      canReply = InteractionControl.NoOne
    } else {
      const mentiontypes: string[] = allowList
        .map((elem: any) => elem['$type'])
        .map((elem: string) => elem.split('app.bsky.feed.threadgate#')[1])
      if (mentiontypes.includes('mentionRule')) {
        if (mentiontypes.includes('followingRule')) {
          canReply = mentiontypes.includes('followerRule')
            ? InteractionControl.FollowersFollowingAndMentioned
            : InteractionControl.FollowingAndMentioned
        } else {
          canReply = mentiontypes.includes('followerRule')
            ? InteractionControl.FollowersAndMentioned
            : InteractionControl.MentionedUsersOnly
        }
      } else {
        if (mentiontypes.includes('followingRule')) {
          canReply = mentiontypes.includes('followerRule')
            ? InteractionControl.FollowersAndFollowing
            : InteractionControl.Following
        } else {
          canReply = mentiontypes.includes('followerRule') ? InteractionControl.Followers : InteractionControl.NoOne
        }
      }
    }
  }

  // bug in bsky. force threads to be sameasop
  if (parent) {
    canReply = InteractionControl.SameAsOp
  }
  if (canQuote === InteractionControl.Anyone && canReply != InteractionControl.Anyone) {
    canQuote = canReply
  }

  return {
    quoteControl: canQuote,
    replyControl: canReply,
    likeControl: InteractionControl.Anyone,
    reblogControl: InteractionControl.Anyone
  }
}

async function processReplies(uri: string, cursor?: string) {
  // TODO we need to get constelations
  const localPost = await Post.findOne({
    where: {
      bskyUri: uri
    }
  })
  if (localPost) {
    let uriToSearch = localPost.bskyUri as string
    if (localPost.hierarchyLevel != 1) {
      const ancestors = (
        await sequelize.query(
          `
    WITH RECURSIVE ancestors AS (
      SELECT "parentId" as "ancestorId" FROM posts WHERE id = :postId
      AND "parentId" IS NOT NULL
      AND "rootId" = :rootId
      UNION ALL
      SELECT p.id FROM posts p
      INNER JOIN ancestors a ON p.id = a."ancestorId"
    )
    SELECT DISTINCT "ancestorId" FROM ancestors
    `,
          {
            replacements: { postId: localPost.id, rootId: localPost.rootId },
            type: QueryTypes.SELECT
          }
        )
      ).map((elem: any) => elem.ancestorId)
      const rootPost = (await Post.findOne({
        where: {
          id: {
            [Op.in]: ancestors
          },
          hierarchyLevel: 1
        }
      })) as Post
      if (rootPost) {
        uriToSearch = rootPost.bskyUri as string
        return processReplies(uriToSearch, cursor)
      } else {
        return
      }
    }
    let url = `${completeEnvironment.bskyConstellationUrl}/links?target=${encodeURIComponent(uriToSearch)}&collection=app.bsky.feed.post&path=.reply.root.uri`
    if (cursor) {
      url = url + `&cursor=${cursor}`
    }
    const constellationPetition = await (
      await fetch(url, {
        headers: {
          'User-Agent': getUserAgent('ATProtoWorker')
        }
      })
    ).json()
    const uris = constellationPetition.linking_records.map(
      (elem: any) => `at://${elem.did}/${elem.collection}/${elem.rkey}`
    )
    await processSinglePostQueue.addBulk(
      uris.map((elem: string) => {
        return {
          name: 'processSinglePost',
          data: {
            post: elem,
            forceUpdate: false
          }
        }
      })
    )
    if (constellationPetition.cursor) {
      await processReplies(uri, constellationPetition.cursor)
    }
  }
}

function getQuotedPostUri(post: any): string | undefined {
  let res: string | undefined = undefined
  const embed = (post.value as any).embed
  if (embed && ['app.bsky.embed.record'].includes(embed['$type'])) {
    res = embed.record.uri
  }
  // case of post with pictures and quote
  else if (embed && ['app.bsky.embed.recordWithMedia'].includes(embed['$type'])) {
    res = embed.record.record.uri
  }
  return res
}

async function getPostThreadPDSDirect(inputUri: string) {
  try {
    const { did, collection, rKey } = extractUriComponents(inputUri)
    const pdsUrl = await getServerFromDid(did)
    const petition = await (
      await fetch(
        `${pdsUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${collection}&rkey=${encodeURIComponent(rKey)}`,
        {
          headers: {
            'User-Agent': getUserAgent('ATProtoWorker')
          }
        }
      )
    ).json()
    return petition as ComAtprotoRepoGetRecord.OutputSchema
  } catch (error) {
    logger.debug({
      message: `Error obtaining from pds: ${inputUri}`,
      error: error
    })
    return undefined
  }
}

/** Checks if `post.langs` has only 1 value and if its present in languages.ts */
function getPostLanguage(post: AppBskyFeedPost.Main): string | undefined {
  if (post.langs && post.langs.length == 1) {
    return filterLanguageCode(post.langs[0])
  }

  return undefined
}

export { getQuotedPostUri, processSinglePost, getPostThreadPDSDirect, getPostInteractionLevels, processReplies }
