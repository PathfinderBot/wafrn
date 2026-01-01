import { Job } from "bullmq";
import { Post } from "../../models/post.js";
import { getAtProtoThread } from "../../atproto/utils/getAtProtoThread.js";
import { getPostThreadRecursive } from "../activitypub/getPostThreadRecursive.js";
import { getAdminUser } from "../getAdminAndDeletedUser.js";
import { logger } from "../logger.js";


async function mergePost(job: Job) {
    const postId = job.data.postId
    const post = await Post.findByPk(postId)
    if(post) {
        const adminUser = await getAdminUser()
        logger.info({ message: `merging post`,id: post.id })
        if (post.bskyUri && !post.remotePostId) {
          // bsky post
          await getAtProtoThread(post.bskyUri, true)
        } else if (post.remotePostId && !post.bskyUri) {
          // fedi post
          const remotePost = await getPostThreadRecursive(adminUser, post.remotePostId)
          if (remotePost) {
            await getPostThreadRecursive(adminUser, post.remotePostId, undefined, remotePost.id)
          }
        }
    }
}

export {mergePost}