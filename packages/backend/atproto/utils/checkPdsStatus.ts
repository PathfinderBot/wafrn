import { completeEnvironment } from '../../utils/backendOptions.js'
import { logger } from '../../utils/logger.js'
import { redisCache } from '../../utils/redis.js'
import { wait } from '../../utils/wait.js'

const PDS_STATUS_CACHE_KEY = 'bskyPdsStatus'
const PDS_UP_CACHE_TTL = 30
const PDS_DOWN_CACHE_TTL = 5

function getPdsServiceUrl(): string {
  return completeEnvironment.bskyPds.startsWith('http')
    ? completeEnvironment.bskyPds
    : 'https://' + completeEnvironment.bskyPds
}

async function probePdsHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getPdsServiceUrl()}/xrpc/_health`, {
      signal: AbortSignal.timeout(5000)
    })
    return res.ok
  } catch (error) {
    return false
  }
}

async function isPdsUp(bypassCache = false): Promise<boolean> {
  if (!bypassCache) {
    const cached = await redisCache.get(PDS_STATUS_CACHE_KEY)
    if (cached !== null) {
      return cached === '1'
    }
  }
  const up = await probePdsHealth()
  await redisCache.set(PDS_STATUS_CACHE_KEY, up ? '1' : '0', 'EX', up ? PDS_UP_CACHE_TTL : PDS_DOWN_CACHE_TTL)
  return up
}

async function waitForPds(maxAttempts = 3, delayMs = 3000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const up = await isPdsUp(attempt > 1)
    if (up) {
      return true
    }
    logger.warn({
      message: `Bsky PDS seems to be down (attempt ${attempt}/${maxAttempts})`
    })
    if (attempt < maxAttempts) {
      await wait(delayMs)
    }
  }
  return false
}

export { isPdsUp, waitForPds }
