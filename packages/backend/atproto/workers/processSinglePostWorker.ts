import { processSinglePost } from '../utils/getAtProtoThread.js'
import { Job } from 'bullmq'

async function processSinglePostJob(job: Job): Promise<string | undefined> {
  if (!job.data.post) {
    return undefined
  }
  const post = await processSinglePost(job.data.post, job.data.forceUpdate)
  return post
}

export { processSinglePostJob }
