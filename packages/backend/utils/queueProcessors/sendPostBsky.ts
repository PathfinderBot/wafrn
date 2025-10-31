import { Job } from 'bullmq'
import { Media, Post, PostTag, Quotes, User, Notification } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { Privacy } from '../../models/post.js'
import { getAtProtoSession } from '../../atproto/utils/getAtProtoSession.js'
import { postToAtproto } from '../../atproto/utils/postToAtproto.js'
import { wait } from '../wait.js'
import { logger } from '../logger.js'

async function sendBiteBsky(biterId: string, postId?: string, userId?: string) {
  const post = postId ? await Post.findByPk(postId) : undefined
  const user = userId ? await User.findByPk(userId) : undefined
  const localUser = await User.findByPk(biterId);

  if ((post && !post?.bskyUri) || (user && !user.bskyDid)) return; // make sure there is actually a bsky user
  if (!localUser || !localUser.enableBsky) return; // make sure there's actually a bsky account to put the record on

  const subjectUri = post ? post.bskyUri : user ? 'at://' + user.bskyDid : '';

  const bskyBite = {
    "$type": "net.wafrn.feed.bite",
    "subject": subjectUri,
    createdAt: new Date(Date.now()).toISOString(),
  }

  let agent = await getAtProtoSession(localUser);

  await agent.com.atproto.repo.createRecord({
    repo: agent.session?.did ?? localUser.bskyDid ?? '',
    collection: "net.wafrn.feed.bite",
    record: bskyBite
  });
}

async function sendPostBsky(job: Job) {
  const post = await Post.findByPk(job.data.postId)
  if (!post || post.bskyUri) {
    // post non existing or post already in bsky!
    return
  }
  const parent = post.parentId ? await Post.findByPk(post.parentId) : undefined
  const parentPoster = parent ? await User.findByPk(parent.userId) : undefined
  const localUser = await User.findByPk(post.userId)
  if (post.privacy === Privacy.Public && localUser?.enableBsky && completeEnvironment.enableBsky) {
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
}

export { sendPostBsky, sendBiteBsky }
