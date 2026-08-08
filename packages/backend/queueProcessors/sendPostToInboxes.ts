import { Job } from 'bullmq'
import { logger } from '../utils/logger.js'
import { postPetitionSigned } from '../activitypub/postPetitionSigned.js'
import { promiseRace } from '../atproto/utils/promiseRace.js'

async function sendPostToInboxes(job: Job) {
  const inbox: string = job.data.inboxList
  const localUser = job.data.petitionBy
  const objectToSend = job.data.objectToSend
  const tmp = await promiseRace([postPetitionSigned(objectToSend, localUser, inbox)], 30000)

  if (tmp[0] === undefined || tmp[0] === null) {
    throw new Error(`Failed to deliver post to inbox ${inbox} within timeout`)
  }
  return true
}

export { sendPostToInboxes }
