import { Response } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import { Job, ParentOptions } from 'bullmq'
import { logger } from '../utils/logger.js'
import { redisCache } from '../utils/redis.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { downloadMedia } from '../queueProcessors/downloadMedia.js'

function sendWithCache(res: Response, localFileName: string) {
  // Does the .mime file exist?
  if (fs.existsSync(localFileName + '.mime')) {
    const mime = fs.readFileSync(localFileName + '.mime').toString()
    res.contentType(mime)
  }
  // 1 hour of cache
  res.set('Cache-control', 'public, max-age=3600')
  res.set('Content-Disposition', `inline; filename="${localFileName.split('/').pop()}"`)
  res.sendFile(localFileName, { root: '.' })
}

async function getMediaFromUrl(
  mediaUrl: string,
  res?: Response,
  force = false,
  extraJobData?: { parentData?: ParentOptions; priority: number }
) {
  try {
    // In case any empty or null image got joined to the completeEnvironment.mediaUrl, we catch it here
    if (mediaUrl === completeEnvironment.mediaUrl) {
      if (res) {
        res.sendStatus(404)
      }
      return
    }

    const mediaLinkHash = crypto.createHash('sha256').update(mediaUrl).digest('hex')
    const localFileName = `cache/${mediaLinkHash}`
    const lockKey = `download:lock:${mediaUrl}`
    const lockValue = crypto.randomUUID()
    const failureKey = `download:failed:${mediaLinkHash}`

    // if file exists
    if (fs.existsSync(localFileName) && !force) {
      if (res) {
        return sendWithCache(res, localFileName)
      }
      return
    }
    if (!force && (await redisCache.get(failureKey))) {
      if (res) {
        res.sendStatus(404)
      }
      return
    }

    // Try to acquire lock in Redis
    const lockAcquired = (await redisCache.get(lockKey)) ? false : await redisCache.set(lockKey, lockValue, 'EX', 30)

    if (lockAcquired) {
      // We have the lock, proceed with download
      try {
        const data = await downloadMedia({
          data: {
            mediaUrl
          }
        } as Job)

        if (res) {
          return sendWithCache(res, data.localFileName)
        }
      } catch (error) {
        await redisCache.set(failureKey, '1', 'EX', 600)
        throw error
      } finally {
        // Release lock
        await redisCache.del(lockKey)
      }
    } else {
      // Another process is downloading, wait for the file
      let attempts = 0
      const maxAttempts = 150 // 30 seconds max wait time (150 * 200ms)

      while (attempts < maxAttempts) {
        if (fs.existsSync(localFileName)) {
          if (res) {
            return sendWithCache(res, localFileName)
          }
          return
        }
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 200))
        attempts++
      }

      // Timeout waiting for file
      if (res) {
        res.sendStatus(504) // Gateway Timeout
      }
    }
  } catch (error) {
    logger.debug({
      message: 'Error with cacher',
      url: mediaUrl,
      error: error
    })
    if (res) {
      res.sendStatus(500)
    }
  }
}

export { getMediaFromUrl }
