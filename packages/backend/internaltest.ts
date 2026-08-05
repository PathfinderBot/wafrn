import { forcePopulateCache } from './atproto/cache/forcePopulateCache.js'
import { getPostAndUserFromPostId } from './utils/cacheGetters/getPostAndUserFromPostId.js'

console.log('Hello dear developer, you seem to be testing something')

await getPostAndUserFromPostId('bf64fc8d-e0a3-4c69-a9db-009f8971593f', true)
