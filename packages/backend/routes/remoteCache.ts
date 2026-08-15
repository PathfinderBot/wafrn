import { Application, Request, Response } from 'express'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'
import { redisCache } from '../utils/redis.js'
import { getLinkPreview } from 'link-preview-js'
import { linkPreviewRateLimiter } from '../utils/rateLimiters.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { Media } from '../models/media.js'
import { Op } from 'sequelize'
import { User } from '../models/user.js'
import { Emoji } from '../models/emoji.js'
import getUserAgent from '../utils/getUserAgent.js'
import { assertUrlResolvesPublic } from '../utils/ssrfProtection.js'
import { getMediaFromUrl } from '../services/mediaCache.js'
import { getFeedAvatarUrl } from '../atproto/utils/bskyFeeds.js'

function cacheRoutes(app: Application) {
  // DEPRECATED ENDPOINT
  app.get('/api/cache', async (req: Request, res: Response) => {
    res.sendFile('uploads/deprecatedEndpoint.jpg', { root: '.' })
  })

  app.get('/api/v2/cache/media/:id', async (req: Request, res: Response) => {
    const mediaId = req.params.id
    const force = req.query.force === 'true'
    const mediaUrl = mediaId ? await getMediaUrlCache(mediaId, force) : undefined
    if (mediaUrl) {
      try {
        return await getMediaFromUrl(mediaUrl, res, force)
      } catch (error) {
        logger.trace({
          message: `Error obtaining media ${mediaUrl}`,
          error: error
        })
        return res.sendStatus(500)
      }
    } else {
      return res.sendStatus(404)
    }
  })

  async function getMediaUrlCache(id: string, ignoreCache: boolean): Promise<string> {
    let res = ''
    if (ignoreCache) {
      await redisCache.del('media:' + id)
    }
    const redisData = await redisCache.get('media:' + id)
    const media = redisData ? JSON.parse(redisData) : (await Media.findByPk(id))?.dataValues
    if (!redisData && media) {
      await redisCache.set('media:' + id, JSON.stringify(media), 'EX', 300)
    }
    if (media) {
      res = media.external ? media.url : completeEnvironment.mediaUrl + media.url
    }

    return res
  }

  app.get('/api/v2/cache/avatar/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.params.id
      const force = req.query.force === 'true'
      const avatarUrl = await getAvatarUrlCache(userId, force)
      if (avatarUrl) {
        await getMediaFromUrl(avatarUrl, res, force)
      } else {
        res.sendStatus(404)
      }
    } catch (error) {
      logger.debug({
        message: `Error caching user avatar`,
        error: error
      })
      res.sendStatus(500)
    }
  })

  async function getAvatarUrlCache(id: string, ignoreCache: boolean) {
    let res = ''
    if (ignoreCache) {
      await redisCache.del('avatar:' + id)
    }
    const avatarCache = await redisCache.get('avatar:' + id)
    const user = avatarCache
      ? (JSON.parse(avatarCache) as User)
      : await User.scope('full').findOne({
          attributes: ['email', 'avatar'],
          where: {
            banned: false,
            [Op.or]: [
              {
                id: id
              },
              {
                url: id
              }
            ]
          }
        })
    if (user) {
      if (!user.avatar) {
        return null
      }
      res = user.email ? `${completeEnvironment.mediaUrl}${user.avatar}` : user.avatar
    }
    if (user && !avatarCache) {
      await redisCache.set('avatar:' + id, JSON.stringify(user.dataValues), 'EX', 300)
    }
    return res
  }

  app.get('/api/v2/cache/bskyFeedAvatar/:id', async (req: Request, res: Response) => {
    try {
      const feedUri = decodeURIComponent(req.params.id)
      const force = req.query.force === 'true'
      const avatarUrl = await getBskyFeedAvatarUrlCache(feedUri, force)
      if (avatarUrl) {
        await getMediaFromUrl(avatarUrl, res, force)
      } else {
        res.sendStatus(404)
      }
    } catch (error) {
      logger.debug({
        message: `Error caching bsky feed avatar`,
        error: error
      })
      res.sendStatus(500)
    }
  })

  async function getBskyFeedAvatarUrlCache(feedUri: string, ignoreCache: boolean) {
    if (ignoreCache) {
      await redisCache.del('bskyFeedAvatar:' + feedUri)
    }
    const cached = await redisCache.get('bskyFeedAvatar:' + feedUri)
    if (cached !== null) {
      return cached || null
    }
    const avatarUrl = await getFeedAvatarUrl(feedUri)
    await redisCache.set('bskyFeedAvatar:' + feedUri, avatarUrl || '', 'EX', 300)
    return avatarUrl || null
  }

  app.get('/api/v2/cache/header/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.params.id
      const force = req.query.force === 'true'
      const url = await getHeaderUrlCache(userId, force)
      if (url) {
        await getMediaFromUrl(url, res, force)
      } else {
        res.sendStatus(404)
      }
    } catch (error) {
      logger.debug({
        message: `Error caching user header`,
        error: error
      })
      res.sendStatus(500)
    }
  })

  async function getHeaderUrlCache(id: string, ignoreCache: boolean) {
    let res = ''
    if (ignoreCache) {
      await redisCache.del('header:' + id)
    }
    const headerCache = await redisCache.get('header:' + id)
    const user = headerCache
      ? (JSON.parse(headerCache) as User)
      : await User.scope('full').findOne({
          attributes: ['email', 'headerImage'],
          where: {
            banned: false,
            [Op.or]: [
              {
                id: id
              },
              {
                url: id
              }
            ]
          }
        })

    if (user) {
      if (!user.headerImage) {
        return null
      }
      res = user.email ? `${completeEnvironment.mediaUrl}${user.headerImage}` : user.headerImage
    }
    if (user && !headerCache) {
      await redisCache.set('header:' + id, JSON.stringify(user.dataValues), 'EX', 300)
    }
    return res
  }

  app.get('/api/v2/cache/emoji/:id', async (req: Request, res: Response) => {
    const emojiUUID = req.params.id
    const url = await getEmojiUrl(emojiUUID)
    if (url) {
      try {
        await getMediaFromUrl(url, res)
      } catch (error) {
        logger.trace({
          message: `Error obtaining media ${url}`,
          error: error
        })
        res.sendStatus(500)
      }
    } else {
      res.sendStatus(404)
    }
  })

  async function getEmojiUrl(id: string): Promise<string> {
    let res = ''
    const cacheData = await redisCache.get('emoji:' + id)
    const emoji = cacheData
      ? JSON.parse(cacheData)
      : await Emoji.findOne({
          where: {
            uuid: id
          }
        })
    if (emoji) {
      res = emoji.external ? emoji.url : completeEnvironment.mediaUrl + emoji.url
    }
    if (emoji && !cacheData) {
      await redisCache.set('emoji:' + id, JSON.stringify(emoji.dataValues), 'EX', 300)
    }
    return res
  }

  app.get('/api/v2/cache/youtube/:id', async (req: Request, res: Response) => {
    const youtubeId = decodeURIComponent(req.params.id)
    const ytRegex =
      /((?:https?:\/\/)?(www.|m.)?(youtube(\-nocookie)?\.com|youtu\.be)\/(v\/|watch\?v=|embed\/)?([\S]{11}))([^\S]|\?[\S]*|\&[\S]*|\b)/g
    let match: any[] = youtubeId.matchAll(ytRegex).toArray()
    match = match.length === 1 ? match[0] : match
    if (match && match.length >= 7) {
      try {
        await getMediaFromUrl(`https://img.youtube.com/vi/${match[6]}/hqdefault.jpg`, res)
      } catch (error) {
        logger.trace({
          message: `Error obtaining media youtube ${match[6]}`,
          error: error
        })
        res.sendStatus(500)
      }
    } else {
      res.sendStatus(404)
    }
  })

  app.get('/api/v2/cache/favicon/:id', async (req: Request, res: Response) => {
    try {
      const link = new URL(decodeURIComponent(req.params.id))
      await getMediaFromUrl('https://' + link.hostname + '/favicon.ico', res)
    } catch (error) {
      res.sendStatus(500)
    }
  })

  app.get('/api/v2/cache/imageurl/:id', async (req: Request, res: Response) => {
    try {
      const link = decodeURIComponent(req.params.id)

      const shasum = crypto.createHash('sha1')
      shasum.update(link.toLowerCase())
      const urlHash = shasum.digest('hex')
      // Here is the thing: for this to be asked, the link component has to load first so we can assume cache has been set
      const cacheResult = JSON.parse((await redisCache.get('linkPreviewCache:' + urlHash)) || '{}')
      if (cacheResult && cacheResult.images && cacheResult.images[0]) {
        await getMediaFromUrl(cacheResult.images[0], res)
      } else {
        res.sendStatus(404)
      }
    } catch (error) {
      res.sendStatus(500)
    }
  })

  app.get('/api/linkPreview', linkPreviewRateLimiter, async (req: Request, res: Response) => {
    const url = String(req.query?.url)
    const shasum = crypto.createHash('sha1')
    shasum.update(url.toLowerCase())
    const urlHash = shasum.digest('hex')
    const cacheResult = await redisCache.get('linkPreviewCache:' + urlHash)
    if (cacheResult) {
      res.send(cacheResult)
    } else {
      let result = {}
      let success = false
      try {
        await assertUrlResolvesPublic(url)
        result = await getLinkPreview(url, {
          followRedirects: 'follow',
          headers: { 'User-Agent': getUserAgent('LinkPreview') }
        })
        success = true
      } catch (error) {}
      // we cache the url 24 hours if success, 5 minutes if not
      await redisCache.set('linkPreviewCache:' + urlHash, JSON.stringify(result), 'EX', success ? 86400 : 300)
      res.send(result)
    }
  })
}

export { cacheRoutes }
