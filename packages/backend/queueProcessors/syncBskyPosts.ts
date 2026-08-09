import { Job, Queue } from 'bullmq'
import { User } from '../models/index.js'
import { getServerFromDid } from '../atproto/utils/getServerFromDid.js'
import getUserAgent from '../utils/getUserAgent.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getQueue } from '../utils/queues.js'
import { logger } from '../utils/logger.js'

const processSinglePostQueue = getQueue('processSinglePost')
const MAX_SYNC_PAGES = 1000

async function syncBskyPosts(job: Job) {
  const userId = job.data.userId
  const user = await User.findByPk(userId)
  if (user && user.bskyDid) {
    const pds = await getServerFromDid(user.bskyDid, true)
    if (!pds) {
      return
    }
    let remainingPosts = 100
    let url =
      pds +
      `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.feed.post&limit=100&reverse=false`
    let page = 0
    while (remainingPosts != 0) {
      if (page >= MAX_SYNC_PAGES) {
        logger.debug({
          message: `Aborting syncBskyPosts: max page count exceeded`,
          userId,
          page
        })
        break
      }
      page++
      const postsResponse = await (
        await fetch(url, {
          headers: {
            'User-Agent': getUserAgent('ATProtoWorker')
          }
        })
      ).json()
      // do things
      processSinglePostQueue.addBulk(
        postsResponse.records.map((elem: any) => {
          return {
            name: `processSinglePost`,
            data: {
              post: elem.uri
            }
          }
        })
      )
      url =
        pds +
        `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.feed.post&limit=100&reverse=false&cursor=${postsResponse.cursor}`
      remainingPosts = postsResponse.records.length
      if (!postsResponse.cursor) {
        remainingPosts = 0
      }
    }
  }
}

export { syncBskyPosts }
