import { forcePopulateCache } from './atproto/cache/forcePopulateCache.js'
import { getAtprotoUser } from './atproto/utils/getAtprotoUser.js'
import { getPostAndUserFromPostId } from './utils/cacheGetters/getPostAndUserFromPostId.js'

console.log('Hello dear developer, you seem to be testing something')

await getAtprotoUser('@blazeape.xyz', {ignoreCache: true})
