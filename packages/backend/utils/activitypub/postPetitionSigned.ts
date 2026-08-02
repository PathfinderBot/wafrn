import { createHash, createSign } from 'node:crypto'
import { completeEnvironment } from '../backendOptions.js'
import { logger } from '../logger.js'
import { removeUser } from './removeUser.js'
import { User } from '../../models/index.js'
import axios from 'axios'
import getUserAgent from '../getUserAgent.js'

async function postPetitionSigned(message: object, userInput: User, target: string): Promise<any> {
  const user = (await User.scope('full').findByPk(userInput.id)) as User
  let petition: any
  if (!user) {
    return
  }

  let res
  if (user.url === completeEnvironment.deletedUser) {
    return {}
  }
  if (user.url === completeEnvironment.deletedUser) {
    console.debug({
      warning: `POST petition to ${target} made by deleted user`,
      object: message
    })
  }
  try {
    const url = new URL(target)
    const digest = createHash('sha256').update(JSON.stringify(message)).digest('base64')
    const signer = createSign('sha256')
    const sendDate = new Date()
    const stringToSign = `(request-target): post ${url.pathname}\nhost: ${
      url.host
    }\ndate: ${sendDate.toUTCString()}\nalgorithm: rsa-sha256\ndigest: SHA-256=${digest}`
    signer.update(stringToSign)
    signer.end()
    const signature = signer.sign(user.privateKey as string).toString('base64')
    const header = `keyId="${
      completeEnvironment.frontendUrl
    }/fediverse/blog/${user.url.toLocaleLowerCase()}#main-key",algorithm="rsa-sha256",headers="(request-target) host date algorithm digest",signature="${signature}"`
    const headers = {
      'Content-Type': 'application/activity+json',
      'User-Agent': getUserAgent('ActivityPubWorker'),
      Accept: 'application/activity+json',
      Algorithm: 'rsa-sha256',
      Host: url.host,
      Date: sendDate.toUTCString(),
      Digest: `SHA-256=${digest}`,
      Signature: header
    }
    res = (await axios.post(target, message, { headers: headers })).data
  } catch (error: any) {
    if (error.response?.status === 410) {
      logger.trace(`should remove user ${target}`)
      const userToRemove = await User.findOne({
        where: {
          remoteInbox: target
        }
      })
      if (userToRemove) {
        logger.trace(`removing user ${userToRemove.url} because got a 410`)
        removeUser(userToRemove.id)
      }
    } else {
      logger.trace({
        message: 'error with signed post petition',
        error: error,
        inputMessage: message,
        target: target,
        user: user.url
      })
    }
  }
  return res
}

export { postPetitionSigned }
