import { Op, QueryTypes } from 'sequelize'
import {
  Ask,
  Blocks,
  Emoji,
  EmojiReaction,
  FederatedHost,
  Media,
  Post,
  PostEmojiRelations,
  PostMentionsUserRelation,
  PostTag,
  QuestionPoll,
  QuestionPollAnswer,
  QuestionPollQuestion,
  Quotes,
  sequelize,
  ServerBlock,
  User,
  UserBookmarkedPosts,
  UserEmojiRelation,
  UserLikesPostRelations,
  UserOptions
} from '../models/index.js'
import getPosstGroupDetails from './getPostGroupDetails.js'
import getFollowedsIds from '../utils/cacheGetters/getFollowedsIds.js'
import { Queue } from 'bullmq'
import { completeEnvironment } from '../utils/backendOptions.js'
import { InteractionControl, InteractionControlType, Privacy } from '../models/post.js'
import { getAllLocalUserIds } from '../utils/cacheGetters/getAllLocalUserIds.js'
import { checkBskyLabelersNSFW } from '../atproto/utils/checkBskyLabelerNSFW.js'
import { isAdult } from '../utils/isAdult.js'
import { logger } from '../utils/logger.js'
import { getQueue } from '../utils/queues.js'

const updateMediaDataQueue = getQueue('processRemoteMediaData')

async function getQuotes(postIds: string[]): Promise<Quotes[]> {
  return await Quotes.findAll({
    where: {
      quoterPostId: {
        [Op.in]: postIds
      }
    }
  })
}

async function getMedias(postIds: string[]) {
  const medias = await Media.findAll({
    attributes: [
      'id',
      'NSFW',
      'description',
      'url',
      'external',
      'mediaOrder',
      'mediaType',
      'postId',
      'blurhash',
      'width',
      'height'
    ],
    where: {
      postId: {
        [Op.in]: postIds
      }
    }
  })

  let mediasToProcess = medias.filter(
    (elem: any) => !elem.mediaType || (elem.mediaType?.startsWith('image') && !elem.width)
  )
  if (mediasToProcess && mediasToProcess.length > 0) {
    updateMediaDataQueue.addBulk(
      mediasToProcess.map((media: any) => {
        return {
          name: `getMediaData${media.id}`,
          data: { mediaId: media.id }
        }
      })
    )
  }
  return medias
}
async function getMentionedUserIds(
  postIds: string[]
): Promise<{ usersMentioned: string[]; postMentionRelation: any[] }> {
  const mentions = await PostMentionsUserRelation.findAll({
    attributes: ['userId', 'postId'],
    where: {
      postId: {
        [Op.in]: postIds
      }
    }
  })
  const usersMentioned = mentions.map((elem: any) => elem.userId)
  const postMentionRelation = mentions.map((elem: any) => {
    return { userMentioned: elem.userId, post: elem.postId }
  })
  return { usersMentioned, postMentionRelation }
}

async function getTags(postIds: string[]) {
  return await PostTag.findAll({
    attributes: ['postId', 'tagName'],
    where: {
      postId: {
        [Op.in]: postIds
      }
    }
  })
}

async function getLikes(postIds: string[]) {
  return await UserLikesPostRelations.findAll({
    attributes: ['userId', 'postId'],
    where: {
      postId: {
        [Op.in]: postIds
      }
    }
  })
}

async function getBookmarks(postIds: string[], userId: string) {
  return await UserBookmarkedPosts.findAll({
    attributes: ['userId', 'postId'],
    where: {
      userId: userId,
      postId: {
        [Op.in]: postIds
      }
    }
  })
}

async function getEmojis(input: { userIds: string[]; postIds: string[] }): Promise<{
  userEmojiRelation: UserEmojiRelation[]
  postEmojiRelation: PostEmojiRelations[]
  postEmojiReactions: EmojiReaction[]
  emojis: Emoji[]
}> {
  let postEmojisIdsPromise = PostEmojiRelations.findAll({
    attributes: ['emojiId', 'postId'],
    where: {
      postId: {
        [Op.in]: input.postIds
      }
    }
  })

  let postEmojiReactionsPromise = EmojiReaction.findAll({
    attributes: ['emojiId', 'postId', 'userId', 'content'],
    where: {
      postId: {
        [Op.in]: input.postIds
      }
    }
  })

  let userEmojiIdPromise = UserEmojiRelation.findAll({
    attributes: ['emojiId', 'userId'],
    where: {
      userId: {
        [Op.in]: input.userIds
      }
    }
  })

  await Promise.all([postEmojisIdsPromise, userEmojiIdPromise, postEmojiReactionsPromise])
  let postEmojisIds = await postEmojisIdsPromise
  let userEmojiId = await userEmojiIdPromise
  let postEmojiReactions = await postEmojiReactionsPromise

  const emojiIds: string[] = ([] as string[])
    .concat(postEmojisIds.map((elem: any) => elem.emojiId))
    .concat(userEmojiId.map((elem: any) => elem.emojiId))
    .concat(postEmojiReactions.map((reaction: any) => reaction.emojiId))
  return {
    userEmojiRelation: userEmojiId,
    postEmojiRelation: postEmojisIds,
    postEmojiReactions: postEmojiReactions,
    emojis: await Emoji.findAll({
      attributes: ['id', 'url', 'external', 'name', 'uuid'],
      where: {
        id: {
          [Op.in]: emojiIds
        }
      }
    })
  }
}

async function getUnjointedPosts(postIdsInput: string[], posterId: string, doNotFullyHide = false) {
  const userPromise = User.scope('full').findByPk(posterId)
  const usersFollowedByPosterPromise: Promise<string[]> = getFollowedsIds(posterId)
  const usersFollowingPosterPromise: Promise<string[]> = getFollowedsIds(posterId, false, {
    getFollowersInstead: true
  })
  const blockedServersPromise = ServerBlock.findAll({ where: { userBlockerId: posterId } })

  // we need a list of all the userId we just got from the post
  let userIds: string[] = []
  let postIds: string[] = []

  const postsPromise = findPostsWithAncestors(postIdsInput)
  const posts = await postsPromise

  posts.forEach((post: any) => {
    userIds.push(post.userId)
    postIds.push(post.id)
    post.ancestors?.forEach((ancestor: any) => {
      userIds.push(ancestor.userId)
      postIds.push(ancestor.id)
    })
  })

  const bskyCheckPromise = completeEnvironment.enableBsky
    ? (async () => {
        // DETECT BSKY NSFW
        const bskyPosts = await Post.findAll({
          where: {
            id: {
              [Op.in]: postIds
            },
            userId: {
              [Op.notIn]: await getAllLocalUserIds()
            },
            bskyUri: {
              [Op.ne]: null
            }
          }
        })
        if (bskyPosts && bskyPosts.length) {
          await checkBskyLabelersNSFW(bskyPosts.filter((elem) => !elem.content_warning && elem.bskyUri))
        }
        // END DETECT BSKY NSFW
      })()
    : Promise.resolve()

  const quotesPromise = getQuotes(postIds)
  await Promise.all([bskyCheckPromise, quotesPromise])
  const quotes = await quotesPromise
  const quotedPostsIds = quotes.map((quote) => quote.quotedPostId)
  postIds = postIds.concat(quotedPostsIds)

  const [quotedPosts, asks, rewootedPosts] = await Promise.all([
    Post.findAll({
      where: {
        id: {
          [Op.in]: quotedPostsIds
        }
      }
    }),
    Ask.findAll({
      attributes: ['question', 'apObject', 'createdAt', 'updatedAt', 'postId', 'userAsked', 'userAsker'],
      where: {
        postId: {
          [Op.in]: postIds
        }
      }
    }),
    Post.findAll({
      attributes: ['id', 'parentId'],
      where: {
        isReblog: true,
        userId: posterId,
        parentId: {
          [Op.in]: postIds
        }
      }
    })
  ])
  const rewootIds = rewootedPosts.map((r: any) => r.id)

  userIds = userIds
    .concat(quotedPosts.map((q: any) => q.userId))
    .concat(asks.map((elem: any) => elem.userAsked))
    .concat(asks.map((elem: any) => elem.userAsker))
  const emojis = getEmojis({
    userIds,
    postIds
  })
  const mentions = await getMentionedUserIds(postIds)
  userIds = userIds.concat(mentions.usersMentioned)
  userIds = userIds.concat((await emojis).postEmojiReactions.map((react: any) => react.userId))
  const polls = QuestionPoll.findAll({
    where: {
      postId: {
        [Op.in]: postIds
      }
    },
    include: [
      {
        model: QuestionPollQuestion,
        include: [
          {
            model: QuestionPollAnswer,
            required: false,
            where: {
              userId: posterId
            }
          }
        ]
      }
    ]
  })

  let medias = getMedias([...postIds, ...rewootIds])
  let tags = getTags([...postIds, ...rewootIds])

  const [likes, bookmarks] = await Promise.all([getLikes(postIds), getBookmarks(postIds, posterId)])
  userIds = userIds.concat(likes.map((like: any) => like.userId))

  const users = User.findAll({
    attributes: ['url', 'avatar', 'id', 'name', 'remoteId', 'banned', 'bskyDid', 'federatedHostId', 'isBot'],
    where: {
      id: {
        [Op.in]: userIds
      }
    },
    raw: true
  })
  const fediAttachmentsDb = await UserOptions.findAll({
    where: {
      userId: {
        [Op.in]: userIds
      },
      optionName: 'fediverse.public.attachment'
    }
  })
  const usersMap: Map<string, User> = new Map()
  const usersPronounsMap: Map<string, string | undefined> = new Map()
  for (const att of fediAttachmentsDb) {
    const fediAttachments: { name: string; value: string }[] = JSON.parse(att.optionValue)
    const pronouns = fediAttachments.find((elem) => elem.name.toLowerCase() === 'pronouns')?.value
    if (!pronouns) continue
    usersPronounsMap.set(att.userId, pronouns)
  }
  for (const usr of await users) {
    usersMap.set(usr.id, usr)
  }
  const postWithNotes = getPosstGroupDetails(posts)
  await Promise.all([emojis, users, polls, medias, tags, postWithNotes])

  const hostsIds = (await users).filter((elem) => elem.federatedHostId).map((elem) => elem.federatedHostId)
  const [blockedHosts, blockedUsersQuery] = await Promise.all([
    FederatedHost.findAll({
      where: {
        id: {
          [Op.in]: hostsIds as string[]
        },
        blocked: true
      }
    }),
    Blocks.findAll({
      where: {
        [Op.or]: [
          {
            blockerId: posterId
          },
          {
            blockedId: posterId
          }
        ]
      }
    })
  ])
  const blockedHostsIds = blockedHosts.map((elem) => elem.id)
  let blockedUsersSet: Set<string> = new Set()
  for (const block of blockedUsersQuery) {
    blockedUsersSet.add(block.blockedId)
    blockedUsersSet.add(block.blockerId)
  }
  blockedUsersSet.delete(posterId)
  const bannedUserIds = (await users)
    .filter((elem) => elem.banned || (elem.federatedHostId && blockedHostsIds.includes(elem.federatedHostId)))
    .map((elem) => elem.id)

  await Promise.all([usersFollowedByPosterPromise, usersFollowingPosterPromise, tags, medias])
  const usersFollowedByPoster = await usersFollowedByPosterPromise
  const usersFollowingPoster = await usersFollowingPosterPromise
  const tagsAwaited = await tags
  const mediasAwaited = await medias

  const invalidRewoots = [] as string[]
  for (const id of rewootIds) {
    const hasMedia = mediasAwaited.some((media: any) => media.postId === id)
    const hasTags = tagsAwaited.some((tag: any) => tag.postId === id)
    if (hasMedia || hasTags) {
      invalidRewoots.push(id)
    }
  }

  const finalRewootIds = rewootedPosts.filter((r: any) => !invalidRewoots.includes(r.id)).map((r: any) => r.parentId)
  const blockedServers = (await blockedServersPromise).map((elem) => elem.blockedServerId)
  const postsMentioningUser: string[] = mentions.postMentionRelation
    .filter((mention: any) => mention.userMentioned === posterId)
    .map((mention: any) => mention.post)

  // debug shit
  await Promise.all([postWithNotes, quotedPosts])
  const allPosts = (await postWithNotes)
    .concat((await postWithNotes).flatMap((elem: any) => elem.ancestors))
    .concat(await quotedPosts)
    .map((elem: any) => (elem.dataValues ? elem.dataValues : elem))
  const postsToFullySend = allPosts.filter((post: any) => {
    const postIsPostedByUser = post.userId === posterId
    const isReblog =
      post.content === '' &&
      !tagsAwaited.some((tag: any) => tag.postId === post.id) &&
      !mediasAwaited.some((media: any) => media.postId === post.id)
    const validPrivacy = [Privacy.Public, Privacy.LocalOnly, Privacy.Unlisted, Privacy.LinkOnly].includes(post.privacy)
    const userFollowsPoster = usersFollowedByPoster.includes(post.userId) && post.privacy === Privacy.FollowersOnly
    const userIsMentioned = postsMentioningUser.includes(post.id)
    const posterIsInBlockedServer = blockedServers.includes(usersMap.get(post.userId)?.federatedHostId as string)
    return (
      !bannedUserIds.includes(post.userId) &&
      !posterIsInBlockedServer &&
      (postIsPostedByUser || validPrivacy || userFollowsPoster || userIsMentioned || isReblog)
    )
  })
  const postIdsToFullySend: string[] = postsToFullySend
    .filter((elem) => !blockedUsersSet.has(elem.userId))
    .map((post: any) => post.id)
  const postsToSendFiltered = (await postWithNotes)
    .map((post: any) => filterPost(post, postIdsToFullySend, doNotFullyHide))
    .filter((elem: any) => !!elem)
  let mediasToSend = (await medias).filter((elem: any) => {
    return postIdsToFullySend.includes(elem.postId)
  })
  const tagsFiltered = (await tags).filter((tag: any) => postIdsToFullySend.includes(tag.postId))
  const quotesFiltered = quotes.filter((quote: any) => postIdsToFullySend.includes(quote.quoterPostId))
  const pollsFiltered = (await polls).filter((poll: any) => postIdsToFullySend.includes(poll.postId))
  // we edit posts so we add the interactionPolicies
  let postsToSend = postsToSendFiltered
    .filter((elem) => !!elem)
    .map(async (elem) => addPostCanInteract(posterId, elem, usersFollowingPoster, usersFollowedByPoster, mentions))

  let finalPostsToSend = await Promise.all(postsToSend)
  const user = await userPromise
  const userIsAdult = isAdult(user?.birthDate)

  if (!userIsAdult && user?.role !== 10) {
    finalPostsToSend = finalPostsToSend.filter((x) => {
      const cwToFilter = (x.content_warning || '').toLowerCase()
      return (
        !cwToFilter.includes('nsfw') &&
        !cwToFilter.includes('lewd') &&
        !cwToFilter.includes('sexual') &&
        !cwToFilter.includes('nudity') &&
        !cwToFilter.includes('porn')
      )
    })
    mediasToSend = mediasToSend.filter((x) => !x.NSFW)
  }

  return {
    rewootIds: finalRewootIds.filter((elem) => !!elem),
    posts: finalPostsToSend,
    emojiRelations: await emojis,
    mentions: mentions.postMentionRelation.filter((elem) => !!elem),
    users: (await users)
      .filter((elem) => !!elem)
      .map((x) => {
        const pronouns = usersPronounsMap.get(x.id)
        return {
          ...x,
          ...(pronouns
            ? {
                pronouns
              }
            : {})
        }
      }),
    polls: pollsFiltered.filter((elem) => !!elem),
    medias: mediasToSend.filter((elem) => !!elem),
    tags: tagsFiltered.filter((elem) => !!elem),
    likes: likes.filter((elem) => !!elem),
    bookmarks: bookmarks,
    quotes: quotesFiltered.filter((elem) => !!elem),
    quotedPosts: (await quotedPosts)
      .map((elem: any) => filterPost(elem, postIdsToFullySend, doNotFullyHide))
      .filter((elem) => !!elem),
    asks: asks.filter((elem) => !!elem)
  }
}

function filterPost(postToBeFilter: any, postIdsToFullySend: string[], donotHide = false): any {
  let res = postToBeFilter
  if (!postIdsToFullySend.includes(res.id)) {
    res = undefined
  }
  if (res) {
    const ancestorsLength = res.ancestors ? res.ancestors.length : 0
    res.ancestors = res.ancestors
      ? res.ancestors.map((elem: any) => filterPost(elem, postIdsToFullySend, donotHide)).filter((elem: any) => !!elem)
      : []
    res.ancestors = res.ancestors.filter((elem: any) => !(elem == undefined))
    if (ancestorsLength != res.ancestors.length && !donotHide) {
      res = undefined
    }
  }

  return res
}

// we are gona do this for likes, quotes, replies and rewoots... and we may will this function too when user interacts with a post!
async function canInteract(
  level: InteractionControlType,
  userId: string,
  postId: string,
  userFollowersInput?: string[],
  userFollowingInput?: string[],
  mentionsInput?: { usersMentioned: string[]; postMentionRelation: any[] },
  postInput?: any
): Promise<boolean> {
  if (level == InteractionControl.Anyone) {
    return true
  }
  let usersFollowing = userFollowingInput ? userFollowingInput : getFollowedsIds(userId)
  let userFollowers = userFollowersInput
    ? userFollowersInput
    : getFollowedsIds(userId, false, {
        getFollowersInstead: true
      })
  let mentions = mentionsInput ? mentionsInput : getMentionedUserIds([postId])
  let post: Promise<Post | null> | Post | null = postInput !== undefined ? postInput : Post.findByPk(postId)
  await Promise.all([usersFollowing, userFollowers, mentions, post])
  usersFollowing = await usersFollowing
  userFollowers = await userFollowers
  mentions = await mentions
  post = await post
  // TMP hack
  let res = false
  if (post) {
    if (post.userId == userId) {
      return true
    }
    // we order the switch cases by complexity (number of conditions)
    switch (level) {
      case InteractionControl.NoOne: {
        // we already check if user is from poster himself. This is a special one for bsky
        res = false
        break
      }
      case InteractionControl.Followers: {
        res = usersFollowing.includes(post.userId)
        break
      }
      case InteractionControl.Following: {
        // post creator follows you
        res = userFollowers.includes(post.userId)
        break
      }
      case InteractionControl.MentionedUsersOnly: {
        // post creator follows you
        res = mentions.postMentionRelation.some((elem) => elem.post == postId && elem.userMentioned == userId)
        break
      }
      case InteractionControl.FollowersAndMentioned: {
        // post creator follows you
        res =
          usersFollowing.includes(post.userId) ||
          mentions.postMentionRelation.some((elem) => elem.post == postId && elem.userMentioned == userId)
        break
      }
      case InteractionControl.FollowingAndMentioned: {
        // post creator follows you
        res =
          userFollowers.includes(post.userId) ||
          mentions.postMentionRelation.some((elem) => elem.post == postId && elem.userMentioned == userId)
        break
      }
      case InteractionControl.FollowersAndFollowing: {
        // include mentioned users
        res = userFollowers.includes(post.userId) || usersFollowing.includes(post.userId)
        break
      }
      case InteractionControl.FollowersFollowingAndMentioned: {
        res =
          userFollowers.includes(post.userId) ||
          usersFollowing.includes(post.userId) ||
          mentions.postMentionRelation.some((elem) => elem.post == postId && elem.userMentioned == userId)
        break
      }
      case InteractionControl.SameAsOp: {
        const originalPost = await Post.findByPk(post.rootId as string)
        if (!originalPost || originalPost?.id === post.id) {
          res = false
        } else {
          // this will only be used for REPLIES
          res = await canInteract(
            originalPost.replyControl,
            userId,
            originalPost.id,
            userFollowersInput,
            userFollowingInput,
            mentionsInput,
            originalPost
          )
        }
      }
    }
  }

  return !!res
}

async function addPostCanInteract(
  userId: string,
  postInput: any,
  userFollowersInput?: string[],
  userFollowingInput?: string[],
  mentionsInput?: { usersMentioned: string[]; postMentionRelation: any[] }
): Promise<
  Post & {
    canReply: boolean
    canLike: boolean
    canReblog: boolean
    canQuote: boolean
  }
> {
  let post: any = { ...postInput }
  let canReply = canInteract(
    post.replyControl,
    userId,
    post.id,
    userFollowersInput,
    userFollowingInput,
    mentionsInput,
    post
  )
  let canLike = canInteract(
    post.likeControl,
    userId,
    post.id,
    userFollowersInput,
    userFollowingInput,
    mentionsInput,
    post
  )
  let canReblog = canInteract(
    post.reblogControl,
    userId,
    post.id,
    userFollowersInput,
    userFollowingInput,
    mentionsInput,
    post
  )
  let canQuote = canInteract(
    post.quoteControl,
    userId,
    post.id,
    userFollowersInput,
    userFollowingInput,
    mentionsInput,
    post
  )

  await Promise.all([canReblog, canReply, canQuote, canLike])
  post.canReply = await canReply
  post.canLike = await canLike
  post.canReblog = await canReblog
  post.canQuote = await canQuote
  if (post.ancestors) {
    post.ancestors = await Promise.all(
      post.ancestors.map((elem: Post) =>
        addPostCanInteract(userId, elem.dataValues || elem, userFollowersInput, userFollowingInput, mentionsInput)
      )
    )
  }

  return post
}

async function findPostsWithAncestors(postIdsInput: string[]) {
  const postsOriginal = await Post.findAll({
    where: {
      id: { [Op.in]: postIdsInput },
      isDeleted: { [Op.ne]: true }
    }
  })
  const posts = await Promise.all(
    postsOriginal.map(async (post) => {
      const ancestors = await post.getAncestors()
      return { ...post.dataValues, ancestors: ancestors.map((elem) => elem.dataValues) }
    })
  )

  return posts
}

export {
  getUnjointedPosts,
  getMedias,
  getQuotes,
  getMentionedUserIds,
  getTags,
  getLikes,
  getBookmarks,
  getEmojis,
  addPostCanInteract,
  canInteract
}
