import { Op } from 'sequelize'
import { Follows, User } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { activityPubObject } from '../interfaces/fediverse/activityPubObject.js'
import { getQueue } from '../utils/queues.js'
import { redisCache } from '../utils/redis.js'
import { logger } from '../utils/logger.js'

const sendPostQueue = getQueue('sendPostToInboxes')

async function undoFollowsForBlockedHost(userId: string, federatedHostId: string) {
  const localUser = await User.findByPk(userId)
  if (!localUser) return

  const hostUsers = await User.findAll({
    where: { federatedHostId },
    attributes: ['id']
  })
  const hostUserIds = hostUsers.map((elem) => elem.id)
  if (!hostUserIds.length) return

  const followsWhere = {
    [Op.or]: [
      { followerId: userId, followedId: { [Op.in]: hostUserIds } },
      { followedId: userId, followerId: { [Op.in]: hostUserIds } }
    ]
  }

  const affectedFollows = await Follows.findAll({
    where: followsWhere,
    include: [
      { model: User, as: 'follower' },
      { model: User, as: 'followed' }
    ]
  })

  const jobs: { name: string; data: any; opts: any }[] = []

  for (const followRow of affectedFollows) {
    const follower = followRow.follower
    const followed = followRow.followed
    if (!follower || !followed) continue

    if (follower.id === userId) {
      // we were following someone on the blocked server: unfollow them
      if (followed.remoteInbox) {
        const objectToSend: activityPubObject = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          id: `${completeEnvironment.frontendUrl}/fediverse/follows/${follower.id}/${followed.id}/undo`,
          type: 'Undo',
          actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${follower.url.toLowerCase()}`,
          object: {
            actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${follower.url.toLowerCase()}`,
            type: 'Follow',
            object: followed.remoteId,
            id: `${completeEnvironment.frontendUrl}/fediverse/follows/${follower.id}/${followed.id}`
          }
        }
        jobs.push({
          name: 'sendChunk',
          data: {
            objectToSend,
            petitionBy: follower.dataValues,
            inboxList: followed.remoteInbox
          },
          opts: { jobId: `undoFollowBlockedServer-${follower.id}-${followed.id}`, priority: 2097151 }
        })
      }
    } else if (followed.id === userId && followRow.remoteFollowId && follower.remoteInbox) {
      const objectToSend: activityPubObject = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${followed.url.toLowerCase()}`,
        id: `${completeEnvironment.frontendUrl}/fediverse/reject/${encodeURIComponent(followRow.remoteFollowId)}`,
        type: 'Reject',
        object: {
          actor: follower.remoteId,
          id: followRow.remoteFollowId,
          object: `${completeEnvironment.frontendUrl}/fediverse/blog/${followed.url.toLowerCase()}`,
          type: 'Follow'
        }
      }
      jobs.push({
        name: 'sendChunk',
        data: {
          objectToSend,
          petitionBy: followed.dataValues,
          inboxList: follower.remoteInbox
        },
        opts: { jobId: `rejectFollowBlockedServer-${follower.id}-${followed.id}`, priority: 2097151 }
      })
    }
  }

  try {
    if (jobs.length) {
      await sendPostQueue.addBulk(jobs)
    }
  } catch (error) {
    logger.error({ message: 'error queueing follow undo/reject activities for blocked server', error })
  }

  await Follows.destroy({ where: followsWhere })

  redisCache.del('follows:full:' + userId)
  redisCache.del('follows:local:' + userId)
  redisCache.del('follows:notYetAcceptedFollows:' + userId)
}

export { undoFollowsForBlockedHost }
