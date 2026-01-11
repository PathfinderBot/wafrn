import { Job, Queue } from 'bullmq'
import { Media, Post, PostTag, Quotes, User, Notification } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { Privacy } from '../../models/post.js'
import { getAtProtoSession } from '../../atproto/utils/getAtProtoSession.js'
import { postToAtproto } from '../../atproto/utils/postToAtproto.js'
import { wait } from '../wait.js'
import { logger } from '../logger.js'

async function sendPostBsky(job: Job) {
  const post = await Post.findByPk(job.data.postId)
  if (post && !post.bskyUri) {
    const parent = post.parentId ? await Post.findByPk(post.parentId) : undefined
    const parentPoster = parent ? await User.findByPk(parent.userId) : undefined
    const localUser = await User.findByPk(post.userId)
    try {
      if (
        post.privacy === Privacy.Public &&
        localUser?.enableBsky &&
        localUser?.bskyDid &&
        completeEnvironment.enableBsky
      ) {
        if (!parent || parent.bskyUri) {
          // ok the user has bluesky time to send the post
          let isReblog = false
          if (post.content == '' && post.content_warning == '' && post.parentId) {
            const mediaCount = await Media.count({
              where: {
                postId: post.id
              }
            })
            const quotesCount = await Quotes.count({
              where: {
                quoterPostId: post.id
              }
            })
            const tagsCount = await PostTag.count({
              where: {
                postId: post.id
              }
            })
            if (mediaCount + quotesCount + tagsCount === 0) {
              isReblog = true
              if (parent?.bskyUri) {
                let agent = await getAtProtoSession(localUser)
                const { uri } = await agent.repost(parent.bskyUri, parent.bskyCid as string)
                post.bskyUri = uri
                await post.save()
              }
            }
          }
          if (!isReblog) {
            let agent = await getAtProtoSession(localUser)
            const bskyPost = await agent.post(await postToAtproto(post, agent))
            await wait(750)
            const duplicatedPost = await Post.findOne({
              where: {
                bskyCid: bskyPost.cid
              }
            })
            if (duplicatedPost) {
              logger.debug({
                message: `Bluesky duplicated post in database already. Cleaning up`
              })
              await Notification.destroy({
                where: {
                  postId: duplicatedPost.id
                }
              })
              try {
                await duplicatedPost.destroy()
              } catch (err) {
                duplicatedPost.isDeleted = true
                await duplicatedPost.save()
              }
            }
            post.bskyUri = bskyPost.uri
            post.bskyCid = bskyPost.cid
            if (post.parentId) {
              post.replyControl = 100
            }
            await post.save()
          }
        }
      }
      await post.save()
    } catch (error) {
      logger.debug({ message: `Error sending post to bluesky`, error })
    }
  }
  if (post) {
    const prepareSendPostQueue = new Queue('prepareSendPost', {
      connection: completeEnvironment.bullmqConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnFail: true
      }
    })
    // we send the post to fedi once we get the bsky data
    await prepareSendPostQueue.add('prepareSendPost', job.data, {
      jobId: post.id,
      delay: 5000
    })
  }
}

export { sendPostBsky }
