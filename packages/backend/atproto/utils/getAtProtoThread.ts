// returns the post id
import { getAtProtoSession } from './getAtProtoSession.js'
import { QueryParams } from '@atproto/sync/dist/firehose/lexicons.js'
import { EmojiReaction, Media, Notification, Post, PostAncestor, PostMentionsUserRelation, PostReport, PostTag, QuestionPoll, Quotes, RemoteUserPostView, SilencedPost, User, UserBitesPostRelation, UserBookmarkedPosts, UserLikesPostRelations } from '../../models/index.js'
import { Model, Op } from 'sequelize'
import { PostView, ThreadViewPost } from '@atproto/api/dist/client/types/app/bsky/feed/defs.js'
import { getAtprotoUser } from './getAtprotoUser.js'
import { CreateOrUpdateOp } from '@skyware/firehose'
import { logger } from '../../utils/logger.js'
import { RichText } from '@atproto/api'
import showdown from 'showdown'
import { bulkCreateNotifications, createNotification } from '../../utils/pushNotifications.js'
import { getAllLocalUserIds } from '../../utils/cacheGetters/getAllLocalUserIds.js'
import { InteractionControl, InteractionControlType, Privacy } from '../../models/post.js'
import { wait } from '../../utils/wait.js'
import { UpdatedAt } from 'sequelize-typescript'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { include } from 'underscore'
import { MediaAttributes } from '../../models/media.js'
import { getAdminAtprotoSession } from '../../utils/atproto/getAdminAtprotoSession.js'
import { getPostThreadRecursive } from '../../utils/activitypub/getPostThreadRecursive.js'
import { Queue, QueueEvents } from 'bullmq'

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true
})

const processPostQueue = new Queue<{ post: PostView, parentId?: string, forceUpdate?: boolean }, string | undefined>('processSinglePost', {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 6,
    backoff: {
      type: 'exponential',
      delay: 25000
    },
    removeOnFail: false
  }
})
processPostQueue.setMaxListeners(0);

const processPostQueueEvents = new QueueEvents('processSinglePost', {
  connection: completeEnvironment.bullmqConnection,
});
processPostQueueEvents.setMaxListeners(0);

async function processSinglePost(
  post: PostView,
  parentId?: string,
  forceUpdate?: boolean
): Promise<string | undefined> {
  const job = await processPostQueue.add('processSinglePost', { post, parentId, forceUpdate })
  const finished = await job.waitUntilFinished(processPostQueueEvents, 60000).catch((err) => {
    logger.debug(err, "Error occured while getting atproto post")
  });
  return finished ?? undefined
}

async function getAtProtoThread(
  uri: string,
  forceUpdate?: boolean,
  ignoreDescendents?: boolean
): Promise<string | undefined> {
  const postExisting = forceUpdate
    ? undefined
    : await Post.findOne({
      where: {
        bskyUri: uri
      }
    })
  if (postExisting) {
    return postExisting.id
  }

  // TODO optimize this a bit if post is not in reply to anything that we dont have
  const preThread = await getPostThreadSafe({ uri: uri, depth: ignoreDescendents ? 0 : 50, parentHeight: 1000 })
  if (preThread) {
    const thread: ThreadViewPost = preThread.data.thread as ThreadViewPost
    //const tmpDids = getDidsFromThread(thread)
    //forcePopulateUsers(tmpDids, (await adminUser) as Model<any, any>)
    let parentId: string | undefined = undefined
    if (thread.parent) {
      parentId = (await processParents(thread.parent as ThreadViewPost)) as string
    }
    const procesedPost = await processSinglePost(thread.post, parentId, forceUpdate)
    if (thread.replies && procesedPost) {
      for await (const repliesThread of thread.replies) {
        processReplies(repliesThread as ThreadViewPost, procesedPost)
      }
    }
    return procesedPost as string
  } else {
  }
}

async function processReplies(thread: ThreadViewPost, parentId: string) {
  if (thread && thread.post) {
    try {
      const post = await processSinglePost(thread.post, parentId)
      if (thread.replies && post) {
        for await (const repliesThread of thread.replies) {
          processReplies(repliesThread as ThreadViewPost, post)
        }
      }
    } catch (error) {
      logger.debug({
        message: `Error processing bluesky replies`,
        error: error,
        thread: thread,
        parentId
      })
    }
  }
}

async function processParents(thread: ThreadViewPost): Promise<string | undefined> {
  let parentId: string | undefined = undefined
  if (thread.parent) {
    parentId = await processParents(thread.parent as ThreadViewPost)
  }
  return await processSinglePost(thread.post, parentId)
}

function getQuotedPostUri(post: PostView): string | undefined {
  let res: string | undefined = undefined
  const embed = (post.record as any).embed
  if (embed && ['app.bsky.embed.record'].includes(embed['$type'])) {
    res = embed.record.uri
  }
  // case of post with pictures and quote
  else if (embed && ['app.bsky.embed.recordWithMedia'].includes(embed['$type'])) {
    res = embed.record.record.uri
  }
  return res
}

async function getPostThreadSafe(options: any) {
  try {
    const agent = await getAdminAtprotoSession()
    return await agent.getPostThread(options)
  } catch (error) {
    logger.debug({
      message: `Error trying to get atproto thread`,
      options: options,
      error: error
    })
  }
}

export { getAtProtoThread, getQuotedPostUri }
