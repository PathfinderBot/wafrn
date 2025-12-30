import { Job, Queue } from 'bullmq'
import { Follows, Post, User } from '../../models/index.js'
import { getAtProtoThread } from '../../atproto/utils/getAtProtoThread.js'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { logger } from '../logger.js'
import { Op } from 'sequelize'
import { completeEnvironment } from '../backendOptions.js'


// this thing is compute intensive
async function mergeUser(job: Job) {
  const {
    primaryUserId,
    userToMergeId
  }: {
    primaryUserId: string,
    userToMergeId: string
  } = job.data

  if (primaryUserId === userToMergeId) return

  logger.info(job.data, 'working on merging 2 users')

  // first we get the users
  const primaryUser = await User.findByPk(primaryUserId)
  const userToMerge = await User.findByPk(userToMergeId)

  if (!primaryUser || !userToMerge) return
  // then we start the merge
  // we start by force refetching all the posts from usertomerge
  let postsFromUserToMerge = await Post.findAll({
    where: {
      userId: userToMergeId,
      [Op.or]: [
        {
          remotePostId: {
            [Op.eq]: null
          }
        },
        {
          bskyUri: {
            [Op.eq]: null
          }
        }
      ]
    }
  })
  
  const mergePostQueue = new Queue('mergePosts', {
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

  mergePostQueue.addBulk(
    postsFromUserToMerge.map(post => {
      return {
      name: `mergePost-${post.id}`,
      data: { postId: post.id} }
    })
    
  )

  // now for the remainings we just migrate all of them to the new user
  await Post.update({
    userId: primaryUserId
  }, {
    where: {
      userId: userToMergeId
    }
  })

  // then we migrate the user info and stuff
  await Follows.update({
    followerId: primaryUserId
  }, {
    where: {
      followerId: userToMergeId
    }
  })

  await Follows.update({
    followedId: primaryUserId
  }, {
    where: {
      followedId: userToMergeId
    }
  })

  await Follows.update({
    followerId: primaryUserId
  }, {
    where: {
      followerId: userToMergeId
    }
  })

  // now we update the user to merge to decouple the remote post and mark it as deleted
  // we will not delete it so if somethings wrong admins can still recover info
  if (userToMerge.bskyDid) {
    primaryUser.bskyDid = userToMerge.bskyDid
  } else if (userToMerge.remoteId) {
    primaryUser.remoteId = userToMerge.remoteId
    primaryUser.remoteInbox = userToMerge.remoteInbox
    primaryUser.remoteMentionUrl = userToMerge.remoteMentionUrl
    primaryUser.publicKey = userToMerge.publicKey
    primaryUser.followersCollectionUrl = userToMerge.followersCollectionUrl
    primaryUser.followingCollectionUrl = userToMerge.followingCollectionUrl
    primaryUser.isBskyPrimary = true
  }

  primaryUser.alternateUrl = userToMerge.url

  userToMerge.bskyDid = null
  userToMerge.remoteId = null
  userToMerge.banned = true
  userToMerge.remoteInbox = null
  userToMerge.remoteMentionUrl = null
  userToMerge.publicKey = null
  userToMerge.followersCollectionUrl = null
  userToMerge.followingCollectionUrl = null
  userToMerge.save()

  primaryUser.save()

  logger.info({
    message: `Merged users ${primaryUser.url} (primary) and ${userToMerge.url}` }
  )
}

export { mergeUser }
