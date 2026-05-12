import { Job } from 'bullmq'
import { Media, Post, PostTag, Quotes, User, Notification } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { InteractionControl, Privacy } from '../../models/post.js'
import { getAtProtoSession } from '../../atproto/utils/getAtProtoSession.js'
import { postToAtproto } from '../../atproto/utils/postToAtproto.js'
import { wait } from '../wait.js'
import { logger } from '../logger.js'
import { AtUri } from '@atproto/api'
import { redisBloom } from '../redis.js'
import { ROOT_REPLIED_POSTS } from '../../constants.js'

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
            const atProtoObject = await postToAtproto(post, agent)
            if (atProtoObject.reply?.root) {
              await redisBloom.add(ROOT_REPLIED_POSTS, atProtoObject.reply.root)
            }
            const bskyPost = await agent.post(atProtoObject)
            const { rkey } = new AtUri(bskyPost.uri)
            if (bskyPost && agent.session && post.quoteControl != InteractionControl.Anyone) {
              await agent.com.atproto.repo.createRecord({
                repo: agent.session.did,
                collection: 'app.bsky.feed.postgate',
                rkey,
                record: {
                  $type: 'app.bsky.feed.postgate',
                  post: bskyPost.uri,
                  embeddingRules: [
                    { '$type': 'app.bsky.feed.postgate#disableRule' }
                  ],
                  createdAt: new Date().toISOString()
                }
              })
            }
            if (post.hierarchyLevel === 1 && post.replyControl != InteractionControl.Anyone && agent.session) {
              const gates: string[] = []
              if ([InteractionControl.FollowersFollowingAndMentioned, InteractionControl.MentionedUsersOnly, InteractionControl.FollowersAndMentioned, InteractionControl.FollowingAndMentioned].includes(post.replyControl)) {
                gates.push('app.bsky.feed.threadgate#mentionRule')
              }
              if ([InteractionControl.Followers, InteractionControl.FollowersAndFollowing, InteractionControl.FollowersAndMentioned, InteractionControl.FollowersFollowingAndMentioned].includes(post.replyControl)) {
                gates.push('app.bsky.feed.threadgate#followerRule')
              }

              if ([InteractionControl.Following, InteractionControl.FollowingAndMentioned, InteractionControl.FollowersAndFollowing, InteractionControl.FollowersFollowingAndMentioned].includes(post.replyControl)) {
                gates.push('app.bsky.feed.threadgate#followingRule')
              }
              if (post.quoteControl !== InteractionControl.Anyone) {
              }
              await agent.com.atproto.repo.createRecord({
                repo: agent.session.did,
                collection: 'app.bsky.feed.threadgate',
                rkey,
                record: {
                  $type: 'app.bsky.feed.threadgate',
                  post: bskyPost.uri,
                  allow: gates.map(elem => {
                    return {
                      '$type': elem
                    }
                  }),
                  createdAt: new Date().toISOString()
                }
              })


            }
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
}

export { sendPostBsky }
