import { redisCache } from './redis.js'

async function clearUserCache(userId: string) {
  await Promise.all([redisCache.del('avatar:' + userId), redisCache.del('header:' + userId)])
}

export { clearUserCache }
