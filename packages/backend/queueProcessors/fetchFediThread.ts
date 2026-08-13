import { Job } from 'bullmq'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { Post } from '../models/post.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'

async function fetchFediThread(job: Job): Promise<Post | null | undefined> {
  if (!job.data.post) {
    return undefined
  }
  let post = await getPostThreadRecursive(await getAdminUser(), job.data.post, null, undefined, {
    ignoreBridgyRepeat: true
  })
  return post
}

export { fetchFediThread }
