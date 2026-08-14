import { Op } from 'sequelize'
import { FederatedHost, PostHostView, RemoteUserPostView, User } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { postToJSONLD } from './postToJSONLD.js'
import { LdSignature } from './rsa2017.js'
import _ from 'underscore'
import { redisCache } from '../utils/redis.js'
import { activityPubObject } from '../interfaces/fediverse/activityPubObject.js'
import { getQueue } from '../utils/queues.js'
import { LITEPUB_CONTEXT_PATH } from './contexts.js'

const sendPostQueue = getQueue('sendPostToInboxes')
async function federatePostHasBeenEdited(postToEdit: any) {
  const user = await User.scope('full').findByPk(postToEdit.userId)
  if (!user) return

  await redisCache.del('postAndUser:' + postToEdit.id)
  await redisCache.del('postToJsonLD:' + postToEdit.id)
  await redisCache.del('postHttpResponse:' + postToEdit.id)
  const postAsJSONLD = await postToJSONLD(postToEdit.id)
  if (!postAsJSONLD) {
    return
  }
  const objectToSend = {
    '@context': ['https://www.w3.org/ns/activitystreams', `${completeEnvironment.frontendUrl}${LITEPUB_CONTEXT_PATH}`],
    actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
    to: postAsJSONLD.to,
    cc: postAsJSONLD.cc,
    bto: [],
    published: new Date(postToEdit.updatedAt).toISOString(),
    id: `${completeEnvironment.frontendUrl}/fediverse/post/${postToEdit.id}/update/${new Date(
      postToEdit.updatedAt
    ).getTime()}`,
    object: postAsJSONLD.object,
    type: 'Update'
  }

  let serversToSendThePostIds = (
    await PostHostView.findAll({
      where: {
        postId: postToEdit.id
      }
    })
  ).map((elem) => elem.federatedHostId)
  let serversToSendThePostPromise = FederatedHost.findAll({
    where: {
      id: {
        [Op.in]: serversToSendThePostIds
      }
    }
  })
  let usersToSendPostId = (
    await RemoteUserPostView.findAll({
      where: {
        postId: postToEdit.id
      }
    })
  ).map((elem) => elem.userId)
  let usersToSendThePostPromise = User.findAll({
    where: {
      id: {
        [Op.in]: usersToSendPostId
      }
    }
  })

  await Promise.all([serversToSendThePostPromise, usersToSendThePostPromise])
  let serversToSendThePost = await serversToSendThePostPromise
  let usersToSendThePost = await usersToSendThePostPromise
  let urlsToSendPost: string[] = []

  if (serversToSendThePost) {
    urlsToSendPost = urlsToSendPost.concat(
      serversToSendThePost.map((server: any) => server.publicInbox).filter((elem: any) => !!elem)
    )
  }
  if (usersToSendThePost) {
    urlsToSendPost = urlsToSendPost.concat(
      usersToSendThePost.map((usr: any) => usr.remoteInbox).filter((elem: any) => !!elem)
    )
  }
  if (!user.privateKey) return

  const ldSignature = new LdSignature()
  const bodySignature = await ldSignature.signRsaSignature2017(
    objectToSend,
    user.privateKey,
    `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLocaleLowerCase()}`,
    completeEnvironment.instanceUrl,
    new Date()
  )
  for await (const inboxChunk of urlsToSendPost) {
    await sendPostQueue.add(
      'editPostChunk',
      {
        objectToSend: {
          ...objectToSend,
          signature: bodySignature.signature
        },
        petitionBy: user.dataValues,
        inboxList: inboxChunk
      },
      {
        priority: 500,
        delay: 2500
      }
    )
  }
}

export { federatePostHasBeenEdited }
