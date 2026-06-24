import express, { Request, Application, Response } from 'express'
import { Op } from 'sequelize'
import { Ask, Emoji, FederatedHost, Media, Post, Quotes, User, UserOptions, sequelize } from '../models/index.js'
import fs from 'fs'
import dompurify from 'isomorphic-dompurify'
import { redisCache } from '../utils/redis.js'
import { getCheckFediverseSignatureFunction } from '../utils/activitypub/checkFediverseSignature.js'
import { SignedRequest } from '../interfaces/fediverse/signedRequest.js'
import { handlePostRequest } from '../utils/activitypub/handlePostRequest.js'
import { Privacy } from '../models/post.js'
import { getPostHtml } from '../utils/getPostHtml.js'
import { logger } from '../utils/logger.js'
import { Feed } from 'feed'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getallBlockedServers } from '../utils/cacheGetters/getAllBlockedServers.js'
import { getCheckContentNegotiation } from '../utils/activitypub/checkContentNegotiation.js'

const cacheOptions = {
  etag: false,
  maxAge: '1'
}

function frontend(app: Application) {
  const defaultSeoData = completeEnvironment.defaultSEOData
  const defaultSeoDataMetaTag: MetaTagOptions = {
    title: defaultSeoData.title,
    description: defaultSeoData.description,
    image: {
      url: defaultSeoData.img
    }
  }

  app.get('/api/health', async (req, res) => {
    const health = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      status: 'ok',
      checks: {
        database: 'unknown',
        redis: 'unknown'
      }
    }

    try {
      await sequelize.authenticate()
      health.checks.database = 'ok'
    } catch (error) {
      health.checks.database = 'error'
      health.status = 'degraded'
    }

    try {
      await redisCache.ping()
      health.checks.redis = 'ok'
    } catch (error) {
      health.checks.redis = 'error'
      health.status = 'degraded'
    }

    res.status(health.status === 'ok' ? 200 : 503).json(health)
  })
  app.get('/api/disableEmailNotifications/:id/:code', async (req: Request, res: Response) => {
    let result = false
    let userId = req.params.id
    let code = req.params.code
    if (userId && code) {
      let user = await User.findByPk(userId)
      if (user && user.activationCode == code) {
        user.disableEmailNotifications = true
        await user.save()
        result = true
      }
    }
    res.send(
      result
        ? `You successfuly disabled email notifications`
        : `Something went wrong! Please do send an email to the instance admin! Do reply to the email`
    )
  })

  // serve default angular application
  app.get(
    [
      '/',
      '/index.html',
      '/index',
      '/dashboard/*',
      '/dashboard',
      '/login',
      '/register',
      '/privacy',
      '/admin/*',
      '/profile/*'
    ],
    function (_req, res) {
      res.send(getIndexFormatted(defaultSeoDataMetaTag))
    }
  )

  app.get('/post/:id', getCheckFediverseSignatureFunction(false), async function (req: SignedRequest, res) {
    //res.redirect(`/fediverse${req.url}`)
    res.send(
      `<script>
        location.replace('/fediverse${req.url}')
      </script>
      <a href="${completeEnvironment.frontendUrl}/fediverse${req.url}">Hello. Post has been moved here. Please click to go</a>`
    )
  })

  // RSS
  app.get('/blog/:url/rss', async (req: Request, res: Response) => {
    let result: { status: 404 | 200; data: any } = {
      status: 404,
      data: undefined
    }
    if (req.params?.url) {
      const url = req.params.url
      let cacheResult = await redisCache.get('blogRss:' + url)
      if (cacheResult) {
        res.contentType('application/rss+xml')
        return res.send(cacheResult)
      }
      const blog = await User.findOne({
        where: sequelize.and(
          sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase()),
          sequelize.where(sequelize.col('email'), Op.ne, null)
        )
      })
      if (blog) {
        const feed = new Feed({
          title: sanitizeStringForSEO(`${blog.url}'s wafrn blog`),
          description: sanitizeStringForSEO(blog.description),
          id: `${completeEnvironment.frontendUrl}/blog/${blog.url}/rss`,
          link: `${completeEnvironment.frontendUrl}/blog/${blog.url}`,
          image: `${completeEnvironment.mediaUrl}${blog.avatar}`,
          favicon: `${completeEnvironment.frontendUrl}/favicon.ico`,
          copyright:
            'All rights reserved by the user. The content of this blog shall not be used for LLM training data unless stated otherwise in here',
          generator: completeEnvironment.instanceUrl,
          author: {
            name: blog.name,
            link: `${completeEnvironment.frontendUrl}/blog/${blog.url}`
          }
        })
        const rssOption = await UserOptions.findOne({
          where: {
            userId: blog.id,
            optionName: 'wafrn.enableRSS'
          }
        })
        let posts: Post[] = []
        if (rssOption && rssOption.optionValue != '0') {
          // value 0: NO
          // value 1: Only articles
          // value 2: ALL
          posts = await blog.getPosts({
            order: [['createdAt', 'DESC']],
            limit: 10,
            ...(await postSearchAttributes({ onlyArticles: rssOption.optionValue == '1' }))
          })
        }
        posts = posts.reverse()
        posts.forEach((post) => {
          feed.addItem({
            title: sanitizeStringForSEO(post.title ? post.title : `Wafrn post by ${blog.url}`),
            id: post.id,
            link: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`,
            description: sanitizeStringForSEO(post.content.substring(0, 150)),
            content: getPostMicroformat(post, false),
            date: post.createdAt
            // image: post.image
          })
        })
        let dataToCache = feed.rss2()
        await redisCache.set('blogRss:' + url, dataToCache, 'EX', 300)
        result = { status: 200, data: dataToCache }
      }
    }
    res.status(result.status)
    if (result.data) {
      res.contentType('application/rss+xml')
      res.send(result.data)
    } else {
      res.send()
    }
  })

  app.get('/blog/:url/ask', async function (req, res) {
    if (!req.params?.url) return res.send(getIndexFormatted(defaultSeoDataMetaTag))

    try {
      const blogData = await getBlogSEOCache(req.params.url)
      if (blogData) {
        return res.send(getIndexFormatted(Object.assign(blogData, { title: `Ask anything to ${blogData.title}` })))
      }
    } catch (error) {
      logger.debug(error)
    }

    res.send(getIndexFormatted(defaultSeoDataMetaTag))
  })

  app.get('/blog/:url/:somethingElse', async function (_req, res) {
    res.send(getIndexFormatted(defaultSeoDataMetaTag))
  })

  app.get('/blog/:url', async function (req, res) {
    if (!req.params?.url) return res.send(getIndexFormatted(defaultSeoDataMetaTag))

    try {
      const blogData = await getBlogSEOCache(req.params.url)
      if (blogData) {
        return res.send(getIndexFormatted(blogData, blogData.content))
      }
    } catch (error) {
      logger.debug(error)
    }

    res.send(getIndexFormatted(defaultSeoDataMetaTag))
  })

  app.get(
    ['/fediverse/post/:id', '/fediverse/activity/post/:id'],
    getCheckFediverseSignatureFunction(false),
    getCheckContentNegotiation(),
    async (req: SignedRequest, res: Response) => {
      if (req.fediData?.valid) {
        // Check for cached response to avoid re-processing for repeated federated requests
        if (req.params?.id) {
          const cachedResponse = await redisCache.get(`postHttpResponse:${req.params.id}`)
          const possibleObjectToSend = cachedResponse ? JSON.parse(cachedResponse) : undefined
          if (
            possibleObjectToSend &&
            (possibleObjectToSend.to?.includes('https://www.w3.org/ns/activitystreams#Public') ||
              possibleObjectToSend.cc?.includes('https://www.w3.org/ns/activitystreams#Public'))
          ) {
            res.set({
              'content-type': 'application/activity+json',
              'cache-control': 'public, max-age=300'
            })
            return res.send(possibleObjectToSend)
          }
        }
        return await handlePostRequest(req, res)
      }

      if (!req.params?.id) return res.send(getIndexFormatted(defaultSeoDataMetaTag))

      try {
        const postData = await getPostSEOCache(req.params.id)
        if (postData) {
          return res.send(getIndexFormatted(postData, postData.content))
        }
      } catch (error) {
        logger.debug(error)
      }

      res.send(getIndexFormatted(defaultSeoDataMetaTag))
    }
  )
}

function sanitizeStringForSEO(unsanitized: string): string {
  return dompurify
    .sanitize(unsanitized, { ALLOWED_TAGS: [] })
    .replaceAll('"', "'")
    .replaceAll('$', '')
    .replaceAll('\\', '')
}

function getPostMicroformat(post: Post, includeBlog: boolean = false, mainImage?: string): string {
  const skipImage: Array<boolean> = []
  let sanitizedHtml = getPostHtml(post)

  sanitizedHtml = sanitizedHtml.replaceAll(/!\[media-(\d+)\]/g, (_, p1) => {
    if (post.medias?.[p1 - 1]) {
      skipImage[p1 - 1] = true
      const media = post.medias[p1 - 1]
      return `<img class="${
        mainImage == media.fullUrl ? 'u-photo' : ''
      }" style="max-width:100%" title="${sanitizeStringForSEO(media.description)}" src="${media.fullUrl}">`
    } else return ''
  })

  return `<div style="max-width:100%" class="h-entry">
        ${
          includeBlog
            ? `<div class="p-author">
          ${getBlogMicroformat(post.user)}
        </div>`
            : ''
        }
        <a class="u-url u-uid" href="${
          post.fullUrl
        }"><time class="dt-published" datetime="${post.createdAt.toISOString()}">${post.createdAt.toLocaleString()}</time></a>
        ${post.parent ? `<a class="u-in-reply-to" href="${post.parent.fullUrl}">In Reply To</a>` : ''}
        ${post.content_warning ? `<div class="p-summary">${sanitizeStringForSEO(post.content_warning)}</div>` : ''}
        <div class="e-content">
        ${sanitizedHtml}
        ${
          post.medias
            ?.filter((_, idx) => !skipImage[idx])
            ?.map(
              (elem) =>
                `<img class="${
                  mainImage == elem.fullUrl ? 'u-photo' : ''
                }" style="max-width:100%" title="${sanitizeStringForSEO(elem.description)}" src="${elem.fullUrl}">`
            )
            .join('\n') || ''
        }
        </div>
      </div>`
}

function getBlogMicroformat(user: User): string {
  return `<div style="max-width:100%" class="h-card">
            <a class="p-name u-url" rel="me" href="${user.fullUrl}">${sanitizeStringForSEO(user.name)}</a>
            ${user.avatar ? `<img style="max-width:100%" class="u-photo" src="${user.avatarFullUrl}" />` : ''}
            ${
              user.headerImage
                ? `<img style="max-width:100%" class="u-featured" src="${user.headerImageFullUrl}" />`
                : ''
            }
          </div>`
}

const postSearchAttributes = async function (options?: { id?: string; onlyArticles?: boolean }) {
  const result: any = {
    attributes: ['content', 'id', 'privacy', 'content_warning', 'createdAt'],
    where: {
      privacy: {
        [Op.in]: [Privacy.Public, Privacy.LocalOnly, Privacy.Unlisted]
      },
      isDeleted: false,
      isReblog: false
    },
    include: [
      {
        model: Post,
        as: 'parent',
        attributes: ['id', 'remotePostId']
      },
      {
        model: User,
        as: 'user',
        required: true,
        where: {
          hideProfileNotLoggedIn: {
            [Op.ne]: true
          },
          banned: {
            [Op.ne]: true
          },
          [Op.or]: [
            {
              federatedHostId: {
                [Op.notIn]: await getallBlockedServers()
              }
            },
            {
              federatedHostId: null
            }
          ]
        },
        attributes: ['url', 'name', 'avatar', 'headerImage']
      },
      {
        model: Media,
        attributes: ['NSFW', 'url', 'external', 'description']
      },
      {
        model: Emoji,
        attributes: ['name', 'url']
      }
    ]
  }

  if (options?.id) result.where.id = options.id

  return result
}

async function getPostSEOCache(id: string): Promise<MetaTagOptions & { content?: string }> {
  const cachedResData = await redisCache.get('postSeoCache:' + id)
  if (cachedResData) {
    return JSON.parse(cachedResData)
  }

  const defaultSeoData = completeEnvironment.defaultSEOData
  let res: MetaTagOptions & { content?: string } = {
    title: defaultSeoData.title,
    description: defaultSeoData.description
  }

  const post = await Post.findOne(await postSearchAttributes({ id }))
  if (!post || !post.user) return res

  // Title cut to 65 characters
  res.title =
    `${sanitizeStringForSEO(post.user.name)} (${sanitizeStringForSEO(post.user.url)}${post.user.isRemoteUser ? '' : '@' + completeEnvironment.instanceUrl})`.substring(
      0,
      65
    )

  // Description cut to 300 characters
  if (post.content_warning) {
    res.description = `Post has content warning: ${sanitizeStringForSEO(post.content_warning)}`.substring(0, 300)
  } else {
    const contentSanitized = sanitizeStringForSEO(post.content)

    // Attach quotes if possible
    let quotedPostContent = ''
    const quotedPostId = await Quotes.findOne({
      where: {
        quoterPostId: post.id
      }
    })
    if (quotedPostId) {
      const quotedPost = await Post.findByPk(quotedPostId.quotedPostId, {
        include: [
          {
            model: User,
            as: 'user'
          }
        ]
      })
      if (quotedPost) {
        const nameSanitized = sanitizeStringForSEO(quotedPost.user.name).substring(0, 65)
        const urlSanitized = sanitizeStringForSEO(quotedPost.user.url).substring(0, 65)
        const contentSanitized = sanitizeStringForSEO(quotedPost.content)
        quotedPostContent = `&#10;&#10;> Quoting ${nameSanitized} (${urlSanitized}${quotedPost.user.isRemoteUser ? '' : '@' + completeEnvironment.instanceUrl}))&#10;>&#10;> ${contentSanitized}`
      }
    }

    // Attach asks if possible
    let askedPostContent = ''
    const askedPost = await Ask.findOne({
      where: {
        postId: post.id
      }
    })
    if (askedPost) {
      const askerUser = await User.findOne({
        where: {
          id: askedPost.userAsker
        }
      })
      if (askerUser) {
        const nameSanitized = sanitizeStringForSEO(askerUser.name).substring(0, 65)
        const urlSanitized = sanitizeStringForSEO(askerUser.url).substring(0, 65)
        const contentSanitized = sanitizeStringForSEO(askedPost.question)
        askedPostContent = `&#10;&#10;> Ask from ${nameSanitized} (${urlSanitized}${askerUser.isRemoteUser ? '' : '@' + completeEnvironment.instanceUrl}))&#10;>&#10;> ${contentSanitized}`
      }
    }

    res.description = `${contentSanitized}${quotedPostContent}${askedPostContent}`.substring(0, 300)
  }

  const safeMedia = post.medias.filter((media) => media.NSFW === false)
  // Only send back the first image (maybe multiple later?)
  const firstSafeMedia = safeMedia.at(0)
  if (firstSafeMedia) {
    const mediaIsImage = !firstSafeMedia.url.toLowerCase().endsWith('mp4')
    if (mediaIsImage) {
      res.image = {
        url: firstSafeMedia.fullUrl,
        width: firstSafeMedia.width?.toString(),
        height: firstSafeMedia.height?.toString(),
        large: true // User avatars should be small
      }
    } else {
      res.video = {
        url: firstSafeMedia.fullUrl,
        width: firstSafeMedia.width?.toString(),
        height: firstSafeMedia.height?.toString(),
        type: firstSafeMedia.mediaType ?? ''
      }
    }
  }
  res.content = getPostMicroformat(post, true, res.image?.url)

  // Cache result
  redisCache.set('postSeoCache:' + id, JSON.stringify(res), 'EX', 300)

  return res
}

async function getBlogSEOCache(url: string): Promise<MetaTagOptions & { content: string }> {
  const cachedResData = await redisCache.get('blogSeoCache:' + url)
  if (cachedResData) {
    return JSON.parse(cachedResData)
  }

  const defaultSeoData = completeEnvironment.defaultSEOData
  let res: MetaTagOptions & { content: string } = {
    title: defaultSeoData.title,
    description: defaultSeoData.description,
    content: ''
  }

  const user = await User.findOne({
    where: sequelize.and(
      sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase()),
      sequelize.where(sequelize.col('email'), Op.ne, null)
    )
  })

  if (!user) {
    // Given the fact that query can be slow even if the blog does not exist, we should cache the 404
    await redisCache.set('blogSeoCache:' + url, JSON.stringify(res), 'EX', 600)
    return res
  }

  res.title =
    `${sanitizeStringForSEO(user.name)} (${sanitizeStringForSEO(user.url)}${user.isRemoteUser ? '' : '@' + completeEnvironment.instanceUrl})`.substring(
      0,
      65
    )
  res.description = sanitizeStringForSEO(user.description).substring(0, 200)
  res.url = sanitizeStringForSEO(user.url).substring(0, 65)
  // Do not overwrite the value of small
  res.image = {
    url: sanitizeStringForSEO(user.avatarFullUrl)
  }

  res.content = getBlogMicroformat(user)

  const rssOption = await UserOptions.findOne({
    where: {
      userId: user.id,
      optionName: 'wafrn.enableRSS'
    }
  })

  let posts: Post[] = []
  if (rssOption && rssOption.optionValue != '0') {
    // value 0: NO
    // value 1: Only articles
    // value 2: ALL
    posts = await user.getPosts({
      order: [['createdAt', 'DESC']],
      limit: 10,
      ...(await postSearchAttributes({ onlyArticles: rssOption.optionValue == '1' }))
    })
  }

  if (posts.length > 0) {
    res.content += `<div class="h-feed">
          ${posts.map((post) => getPostMicroformat(post, false)).join('\n')}
        </div>`
  }

  if (user) await redisCache.set('blogSeoCache:' + url, JSON.stringify(res), 'EX', 300)

  return res
}

type MetaTagOptions = {
  title: string
  description: string
  url?: string
  image?: {
    url: string
    width?: string
    height?: string
    alt?: string
    large?: true // Whether to use the big image on the twitter meta property
  }
  video?: {
    url: string
    width?: string
    height?: string
    type: string
    alt?: string
  }
  author?: string // literally just SEO
  themeColor?: string // Must be hexadecimal color in the format '#000000'
}

type MetaTagDefinition = { property: string; content: string }

function getIndexFormatted(options: MetaTagOptions, indeWebContent?: string) {
  const indexRaw = fs.readFileSync(`${completeEnvironment.frontedLocation}/index.html`).toString()
  const indexSeo = formatIndexSeo(indexRaw, options)
  const indexIndieweb = formatIndexIndieweb(indexSeo, indeWebContent)
  return indexIndieweb
}

function formatIndexSeo(indexRaw: string, options: MetaTagOptions) {
  const optionsClean: MetaTagDefinition[] = []
  const extraLinks: string[] = []

  //
  // CLEAN STEP, VERY IMPORTANT!!!!
  //
  if (options.title) {
    const titleSanitized = sanitizeStringForSEO(options.title)
    optionsClean.push(
      ...[
        { property: 'og:title', content: titleSanitized },
        { property: 'twitter:title', content: titleSanitized }
      ]
    )
  }

  if (options.description) {
    const descriptionSanitized = sanitizeStringForSEO(options.description)
    optionsClean.push(
      ...[
        { property: 'description', content: descriptionSanitized },
        { property: 'og:description', content: descriptionSanitized },
        { property: 'twitter:description', content: descriptionSanitized }
      ]
    )
  }

  if (options.url) {
    const urlSanitized = sanitizeStringForSEO(options.url)
    optionsClean.push({ property: 'og:url', content: urlSanitized })
    extraLinks.push(`<link rel="canonical" href="${urlSanitized}"`)
  }

  if (options.image) {
    const urlParsed = options.image.url.toLowerCase().startsWith('https')
      ? options.image.url
      : completeEnvironment.mediaUrl + encodeURIComponent(options.image.url)
    const urlSanitized = sanitizeStringForSEO(urlParsed)
    optionsClean.push(
      ...[
        { property: 'og:image', content: urlSanitized },
        { property: 'twitter:image', content: urlSanitized }
      ]
    )
    // Width and height separate
    if (options.image.width) {
      const widthSanitized = sanitizeStringForSEO(options.image.width)
      optionsClean.push(
        ...[
          { property: 'og:image:height', content: widthSanitized },
          { property: 'twitter:image:height', content: widthSanitized }
        ]
      )
    }
    if (options.image.height) {
      const heightSanitized = sanitizeStringForSEO(options.image.height)
      optionsClean.push(
        ...[
          { property: 'og:image:height', content: heightSanitized },
          { property: 'twitter:image:height', content: heightSanitized }
        ]
      )
    }
    if (options.image.large === true) {
      optionsClean.push(
        { property: 'twitter:card', content: 'summary_large_image' } // Makes the images display large!
      )
    }
  }

  if (options.video) {
    const urlParsed = options.video.url.toLowerCase().startsWith('http')
      ? options.video.url
      : completeEnvironment.mediaUrl + options.video.url
    const urlSanitized = sanitizeStringForSEO(urlParsed)
    const typeSanitized = sanitizeStringForSEO(options.video.type)
    optionsClean.push(
      ...[
        { property: 'og:video', content: urlSanitized },
        { property: 'twitter:player:stream', content: urlSanitized },
        { property: 'twitter:player:stream:content_type', content: typeSanitized },
        { property: 'twitter:card', content: 'player' }
      ]
    )
    // Width and height separate
    if (options.video.width) {
      const widthSanitized = sanitizeStringForSEO(options.video.width)
      optionsClean.push({ property: 'og:video:height', content: widthSanitized })
    }
    if (options.video.height) {
      const heightSanitized = sanitizeStringForSEO(options.video.height)
      optionsClean.push({ property: 'og:video:height', content: heightSanitized })
    }
  }

  if (options.author) {
    const authorSanitized = sanitizeStringForSEO(options.author)
    optionsClean.push({ property: 'author', content: authorSanitized })
  }

  if (options.themeColor) {
    const themeColorSanitized = sanitizeStringForSEO(options.themeColor)
    optionsClean.push({ property: 'theme-color', content: themeColorSanitized })
  }

  //
  // Default options as set by server owner environment file
  //
  const instanceName = completeEnvironment.frontendEnvironment.instanceName
  if (instanceName) {
    const instanceNameSanitized = sanitizeStringForSEO(instanceName)
    optionsClean.push({ property: 'og:site_name', content: instanceNameSanitized })
  }

  // Definitions converted to a string of tags
  const metaTags: string = optionsClean.map((option) => createMetaTag(option)).join('\n')

  // The block of text we're swapping out
  const commentToReplace =
    /<!-- BEGIN REMOVE THIS IN EXPRESS FOR SEO -->.*(.*(\n))*.*<!-- END REMOVE THIS IN EXPRESS FOR SEO -->/gm

  // Result (SHOULD BE PURE OR CROSS SITE SCRIPTING WILL DESTROY THE WORLD)
  const indexFormatted = indexRaw.replace(commentToReplace, metaTags)

  return indexFormatted
}

// Returns a meta tag with escaped double quotes
// definition.content MUST BE SANITIZED TO AVOID XSS!
function createMetaTag(definition: MetaTagDefinition): string {
  return `<meta property="${definition.property}" content="${definition.content}">`
}

function formatIndexIndieweb(indexRaw: string, indeWebContent?: string) {
  const indieWebContentSanitized = dompurify.sanitize(indeWebContent || '')

  const bodyCommendToReplace =
    /<!-- BEGIN MAIN CONTENT FOR INDIEWEB -->.*(.*(\n))*.*<!-- END MAIN CONTENT FOR INDIEWEB -->/gm

  const indexFormatted = indexRaw.replace(bodyCommendToReplace, indieWebContentSanitized)

  return indexFormatted
}

export { frontend, getPostSEOCache, getBlogSEOCache }
