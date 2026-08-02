import { getQueue } from '../queues.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { FederatedHost, sequelize, User } from '../../models/index.js'
import { completeEnvironment } from '../backendOptions.js'
import { userToJSONLD } from './userToJSONLD.js'
import { Op } from 'sequelize'
import { redisCache } from '../redis.js'
import { LITEPUB_CONTEXT_PATH } from './contexts.js'

const lowPriorityQueue = getQueue('deletePostQueue')

async function sendUpdateProfile(user: User) {
  await redisCache.del('fediverse:user:base:' + user.id)
  const userObjectData = await userToJSONLD(user)
  delete userObjectData['@context']
  const objectToSend: activityPubObject = {
    '@context': [`${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`],
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}#update/${new Date().getTime()}`,
    object: userObjectData,
    type: 'Update'
  }

  let serversToSendThePost = await FederatedHost.findAll({
    where: {
      publicInbox: { [Op.ne]: null },
      blocked: { [Op.ne]: true },

      [Op.or]: [
        sequelize.literal(
          `"id" in (SELECT "federatedHostId" from "users" where "users"."id" IN (SELECT "followerId" from "follows" where "followedId" = '${user.id}') and "federatedHostId" is not NULL)`
        ),
        {
          friendServer: true
        }
      ]
    }
  })
  const inboxes: string[] = serversToSendThePost.map((elem) => elem.publicInbox as string).filter((elem) => !!elem)

  for await (const inboxChunk of inboxes) {
    await lowPriorityQueue.add(
      'sendChunk',
      {
        objectToSend: objectToSend,
        petitionBy: user.dataValues,
        inboxList: inboxChunk
      },
      {
        priority: 2097151,
        delay: 500
      }
    )
  }
}

export { sendUpdateProfile }
