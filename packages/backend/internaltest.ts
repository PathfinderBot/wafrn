import { postToJSONLD } from './activitypub/postToJSONLD.js'
import { forcePopulateCache } from './atproto/cache/forcePopulateCache.js'
import { getAtprotoUser } from './atproto/utils/getAtprotoUser.js'
import { getPostAndUserFromPostId } from './utils/cacheGetters/getPostAndUserFromPostId.js'

console.log('Hello dear developer, you seem to be testing something')

const tmp = await postToJSONLD('03d4704f-72c6-4d19-9d74-ed44ec237f9a')

console.log(tmp)
