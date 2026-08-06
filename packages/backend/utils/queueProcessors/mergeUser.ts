import { Job } from 'bullmq'
import { Follows, Post, User, UserLikesPostRelations } from '../../models/index.js'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { logger } from '../logger.js'
import { Op } from 'sequelize'
import { completeEnvironment } from '../backendOptions.js'
import { getQueue } from '../queues.js'
import { removeUser } from '../activitypub/removeUser.js'

// this thing is compute intensive
async function mergeUser(job: Job) {
  const {
    primaryUserId,
    userToMergeId
  }: {
    primaryUserId: string
    userToMergeId: string
  } = job.data

  if (primaryUserId === userToMergeId) return

  logger.info(job.data, 'working on merging 2 users')

  // first we get the users
  const primaryUser = await User.scope('full').findByPk(primaryUserId)
  const userToMerge = await User.scope('full').findByPk(userToMergeId)

  // if user is local we dont merge lol
  if (!primaryUser || !userToMerge || primaryUser.email || userToMerge.email) return
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

  const mergePostQueue = getQueue('mergePosts')

  mergePostQueue.addBulk(
    postsFromUserToMerge.map((post) => {
      return {
        name: `mergePost-${post.id}`,
        data: { postId: post.id }
      }
    })
  )

  // now for the remainings we just migrate all of them to the new user
  await Post.update(
    {
      userId: primaryUserId
    },
    {
      where: {
        userId: userToMergeId
      }
    }
  )

  // then we migrate the user info and stuff
  let notToUpdate = await Follows.findAll({
    where: {
      followerId: primaryUserId
    }
  })
  await Follows.update(
    {
      followerId: primaryUserId
    },
    {
      where: {
        followerId: userToMergeId,
        followedId: {
          [Op.notIn]: notToUpdate.map((elem) => elem.followedId)
        }
      }
    }
  )

  notToUpdate = await Follows.findAll({
    where: {
      followedId: primaryUserId
    }
  })
  await Follows.update(
    {
      followedId: primaryUserId
    },
    {
      where: {
        followedId: userToMergeId,
        followerId: {
          [Op.notIn]: notToUpdate.map((elem) => elem.followerId)
        }
      }
    }
  )
  notToUpdate = await Follows.findAll({
    where: {
      followerId: primaryUserId
    }
  })
  await Follows.update(
    {
      followerId: primaryUserId
    },
    {
      where: {
        followerId: userToMergeId,
        followedId: {
          [Op.notIn]: notToUpdate.map((elem) => elem.followedId)
        }
      }
    }
  )

  const newRemoteId = userToMerge.remoteId || primaryUser.remoteId
  const did = userToMerge.bskyDid || primaryUser.bskyDid
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

  primaryUser.remoteId = newRemoteId
  primaryUser.bskyDid = did

  primaryUser.alternateUrl = userToMerge.url

  userToMerge.bskyDid = null
  userToMerge.remoteId = null
  userToMerge.remoteInbox = null
  userToMerge.remoteMentionUrl = null
  userToMerge.publicKey = null
  userToMerge.followersCollectionUrl = null
  userToMerge.followingCollectionUrl = null
  userToMerge.save()
  primaryUser.save()
  await removeUser(userToMerge.id)

  logger.info({
    message: `Merged users ${primaryUser.url} (primary) and ${userToMerge?.url}`
  })
}

export { mergeUser }
