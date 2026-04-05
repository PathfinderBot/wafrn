import { Job, Queue } from "bullmq"
import { User } from "../../models/index.js"
import { getServerFromDid } from "../atproto/getServerFromDid.js"
import getUserAgent from "../getUserAgent.js"
import { completeEnvironment } from "../backendOptions.js"

const processSinglePostQueue = new Queue('processSinglePost', {
                  connection: completeEnvironment.bullmqConnection,
                  defaultJobOptions: {
                    removeOnComplete: true,
                    removeOnFail: true
                  }
                })
async function syncBskyPosts(job: Job) {
    const userId = job.data.userId
    const user = await User.findByPk(userId)
    if (user && user.bskyDid) {
        const pds = await getServerFromDid(user.bskyDid, true)
        let remainingPosts = 100;
        let url = pds + `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.feed.post&limit=100&reverse=false`
        while(remainingPosts != 0) {
            const postsResponse = await (await fetch(url, {
                headers: {
                    "User-Agent": getUserAgent('ATProtoWorker')
                }
            })).json()
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
            url = pds + `/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(user.bskyDid)}&collection=app.bsky.feed.post&limit=100&reverse=false&cursor=${postsResponse.cursor}`
            remainingPosts = postsResponse.records.length
        }
        
    }
}

export {syncBskyPosts}