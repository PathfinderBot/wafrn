import { redisCache } from './redis.js'
import { logger } from './logger.js'

interface CircuitBreakerConfig {
  // Number of consecutive failures before entering backoff
  failureThreshold: number
  // Initial backoff period in seconds
  initialBackoffSeconds: number
  // Multiplier for exponential backoff
  backoffMultiplier: number
  // Maximum backoff period in seconds (e.g., 7 days)
  maxBackoffSeconds: number
  // Success resets the counter to this value (usually 0)
  successResetValue: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 7, // After 7 consecutive failures
  initialBackoffSeconds: 300, // Start with 5 minutes
  backoffMultiplier: 2, // Double on each threshold
  maxBackoffSeconds: 604800, // Cap at 7 days
  successResetValue: 0
}

/**
 * Extract hostname from URL
 * Examples: https://mastodon.social/inbox → mastodon.social
 *           https://pixelfed.social:443/inbox → pixelfed.social
 */
export function getHostFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch (error) {
    logger.warn({ message: 'Failed to extract host from URL', url, error })
    return url
  }
}

/**
 * Get Redis keys for a host's circuit breaker state
 */
function getFailureKey(host: string): string {
  return `delivery:failures:${host}`
}

function getBackoffKey(host: string): string {
  return `delivery:backoff:${host}`
}

function getLastSuccessKey(host: string): string {
  return `delivery:lastSuccess:${host}`
}

/**
 * Check if a host is currently in backoff period
 */
export async function isHostInBackoff(inboxUrl: string): Promise<boolean> {
  const host = getHostFromUrl(inboxUrl)
  const backoffUntil = await redisCache.get(getBackoffKey(host))

  if (!backoffUntil) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  const backoffTimestamp = parseInt(backoffUntil, 10)

  // Still in backoff period
  if (now < backoffTimestamp) {
    return true
  }

  // Backoff period expired, clear it
  await redisCache.del(getBackoffKey(host))
  return false
}

/**
 * Record a delivery failure for a host
 * Returns true if host should enter backoff period
 */
export async function recordDeliveryFailure(
  inboxUrl: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG
): Promise<boolean> {
  const host = getHostFromUrl(inboxUrl)
  const failureKey = getFailureKey(host)

  // Increment failure counter
  const failureCount = await redisCache.incr(failureKey)

  // Set expiration to prevent stale keys (30 days)
  await redisCache.expire(failureKey, 3600 * 24 * 30)

  logger.debug({
    message: 'Delivery failure recorded',
    host,
    failureCount,
    failureThreshold: config.failureThreshold
  })

  // Check if we've hit the failure threshold
  if (failureCount >= config.failureThreshold) {
    // Calculate backoff period (exponential)
    const backoffLevels = Math.floor(failureCount / config.failureThreshold)
    let backoffSeconds = config.initialBackoffSeconds * Math.pow(
      config.backoffMultiplier,
      backoffLevels - 1
    )
    backoffSeconds = Math.min(backoffSeconds, config.maxBackoffSeconds)

    const backoffUntilTimestamp = Math.floor(Date.now() / 1000) + backoffSeconds

    await redisCache.setex(
      getBackoffKey(host),
      Math.floor(backoffSeconds),
      backoffUntilTimestamp.toString()
    )

    logger.info({
      message: 'Host entered delivery backoff period',
      host,
      failureCount,
      backoffSeconds,
      backoffUntil: new Date(backoffUntilTimestamp * 1000).toISOString()
    })

    return true
  }

  return false
}

/**
 * Record a successful delivery for a host
 * Resets the failure counter
 */
export async function recordDeliverySuccess(
  inboxUrl: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG
): Promise<void> {
  const host = getHostFromUrl(inboxUrl)
  const failureKey = getFailureKey(host)
  const lastSuccessKey = getLastSuccessKey(host)

  const previousFailureCount = await redisCache.get(failureKey)

  // Reset failure counter
  if (config.successResetValue === 0) {
    await redisCache.del(failureKey)
  } else {
    await redisCache.set(failureKey, config.successResetValue.toString())
  }

  // Record last successful delivery timestamp
  const now = Math.floor(Date.now() / 1000)
  await redisCache.setex(lastSuccessKey, 604800, now.toString()) // Keep for 7 days

  if (previousFailureCount && parseInt(previousFailureCount, 10) > 0) {
    logger.info({
      message: 'Host delivery success - failure counter reset',
      host,
      previousFailureCount: parseInt(previousFailureCount, 10)
    })
  }
}

/**
 * Get current failure count for a host
 */
export async function getHostFailureCount(inboxUrl: string): Promise<number> {
  const host = getHostFromUrl(inboxUrl)
  const failureKey = getFailureKey(host)
  const count = await redisCache.get(failureKey)
  return count ? parseInt(count, 10) : 0
}

/**
 * Get backoff status for a host
 */
export async function getHostBackoffStatus(
  inboxUrl: string
): Promise<{
  isInBackoff: boolean
  failureCount: number
  backoffUntil?: Date
} | null> {
  const host = getHostFromUrl(inboxUrl)
  const failureKey = getFailureKey(host)
  const backoffKey = getBackoffKey(host)

  const failureCount = await redisCache.get(failureKey)
  const backoffUntil = await redisCache.get(backoffKey)

  if (!failureCount && !backoffUntil) {
    return null
  }

  const isInBackoff = !!(
    backoffUntil && parseInt(backoffUntil, 10) > Math.floor(Date.now() / 1000)
  )

  return {
    isInBackoff,
    failureCount: failureCount ? parseInt(failureCount, 10) : 0,
    backoffUntil: backoffUntil
      ? new Date(parseInt(backoffUntil, 10) * 1000)
      : undefined
  }
}

/**
 * Manually clear backoff period for a host (admin use)
 */
export async function clearHostBackoff(inboxUrl: string): Promise<void> {
  const host = getHostFromUrl(inboxUrl)
  const failureKey = getFailureKey(host)
  const backoffKey = getBackoffKey(host)

  await redisCache.del(failureKey)
  await redisCache.del(backoffKey)

  logger.info({
    message: 'Host backoff period manually cleared',
    host
  })
}

/**
 * Get all hosts currently in backoff
 * Useful for monitoring/debugging
 */
export async function getAllHostsInBackoff(): Promise<
  Array<{
    host: string
    failureCount: number
    backoffUntil: Date
  }>
> {
  try {
    // Scan Redis for all delivery:backoff:* keys
    const keys = await redisCache.keys('delivery:backoff:*')
    const hostsInBackoff = []

    for (const backoffKey of keys) {
      const host = backoffKey.replace('delivery:backoff:', '')
      const backoffUntil = await redisCache.get(backoffKey)
      const failureCount = await redisCache.get(`delivery:failures:${host}`)

      if (backoffUntil) {
        hostsInBackoff.push({
          host,
          failureCount: failureCount ? parseInt(failureCount, 10) : 0,
          backoffUntil: new Date(parseInt(backoffUntil, 10) * 1000)
        })
      }
    }

    return hostsInBackoff
  } catch (error) {
    logger.error({
      message: 'Failed to get hosts in backoff',
      error
    })
    return []
  }
}

export type { CircuitBreakerConfig }
export { DEFAULT_CONFIG }
