import { RichText } from "@atproto/api"
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs.js"
import { Op } from "sequelize"
import { EmojiReaction, Media, Notification, Post, PostAncestor, PostMentionsUserRelation, PostReport, PostTag, QuestionPoll, Quotes, RemoteUserPostView, SilencedPost, User, UserBitesPostRelation, UserBookmarkedPosts, UserLikesPostRelations } from '../../models/index.js'
import { getPostThreadRecursive } from "../../utils/activitypub/getPostThreadRecursive.js"
import { completeEnvironment } from "../../utils/backendOptions.js"
import { getAllLocalUserIds } from "../../utils/cacheGetters/getAllLocalUserIds.js"
import { logger } from "../../utils/logger.js"
import { bulkCreateNotifications, createNotification } from "../../utils/pushNotifications.js"
import { wait } from "../../utils/wait.js"
import { getQuotedPostUri, processSinglePost } from "../utils/getAtProtoThread.js"
import { getAtprotoUser } from "../utils/getAtprotoUser.js"
import { MediaAttributes } from "../../models/media.js"
import { Privacy, InteractionControlType, InteractionControl } from "../../models/post.js"
import { getAdminUser } from "../../utils/getAdminAndDeletedUser.js"
import { Job } from "bullmq"


async function processSinglePostJob(job: Job): Promise<string | undefined> {
  if (!job.data.post) {
    return undefined;
  }
  let post = await processSinglePost(job.data.post, job.data.forceUpdate)
  return post
}


export { processSinglePostJob }