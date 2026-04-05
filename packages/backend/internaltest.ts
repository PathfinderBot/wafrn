import { Op } from "sequelize";
import { migrateUserFedi } from "./utils/activitypub/migrateUser.js";
import { User } from "./models/index.js";
import { getAtprotoUser } from "./atproto/utils/getAtprotoUser.js";
import { processSinglePost } from "./atproto/utils/getAtProtoThread.js";
import { syncBskyAccountData } from "./utils/atproto/syncBskyAccountData.js";
import { syncBskyFollowsJob } from "./utils/queueProcessors/syncBskyFollows.js";
import { syncBskyPosts } from "./utils/queueProcessors/syncBskyPosts.js";




await syncBskyAccountData('2458c8ef-606f-4112-8f4b-eb5f418261d1', {syncFollows: true, syncPosts: true})

