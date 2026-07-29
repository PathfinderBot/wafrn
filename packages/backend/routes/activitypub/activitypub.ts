import { Application, Request, Response } from 'express'
import { Op } from 'sequelize'
import { User, Emoji, sequelize, Quotes, Post } from '../../models/index.js'
import { Privacy } from '../../models/post.js'
import { getCheckFediverseSignatureFunction } from '../../utils/activitypub/checkFediverseSignature.js'
import { return404 } from '../../utils/return404.js'
import { getQueue } from '../../utils/queues.js'
import { SignedRequest } from '../../interfaces/fediverse/signedRequest.js'
import { getPostReplies } from '../../utils/activitypub/getPostReplies.js'
import { redisCache } from '../../utils/redis.js'
import { getFollowedRemoteIds } from '../../utils/cacheGetters/getFollowedRemoteIds.js'
import { getFollowerRemoteIds } from '../../utils/cacheGetters/getFollowerRemoteIds.js'
import { checkuserAllowsThreads } from '../../utils/checkUserAllowsThreads.js'
import { userToJSONLD } from '../../utils/activitypub/userToJSONLD.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { getPostUrlForQuote, postToJSONLD } from '../../utils/activitypub/postToJSONLD.js'

// we get the user from the memory cache. if does not exist we try to find it
async function getLocalUserByUrl(url: string): Promise<any> {
  return await User.scope('full').findOne({
    where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), url.toLowerCase())
  })
}

async function getLocalUserByUrlCache(url: string): Promise<User | undefined> {
  let cacheResult = await redisCache.get('localUserData:' + url)
  if (!cacheResult) {
    cacheResult = JSON.stringify((await getLocalUserByUrl(url))?.dataValues)
    if (cacheResult) {
      redisCache.set('localUserData:' + url, cacheResult, 'EX', 300)
    }
  }
  // this function can return undefined
  return cacheResult ? JSON.parse(cacheResult) : undefined
}

const inboxQueue = getQueue('inbox')

// exported so the pin/unpin endpoints (or anything else that changes what's
// featured for a user) can invalidate this with redisCache.del(...)
function getFeaturedCollectionCacheKey(userId: string): string {
  return `featuredCollection:${userId}`
}

// all the stuff related to activitypub goes here

function activityPubRoutes(app: Application) {
  // Get blog for fediverse
  app.get(
    '/fediverse/blog/:url',
    getCheckFediverseSignatureFunction(false),
    async (req: SignedRequest, res: Response) => {
      const url = req.params.url.toLowerCase()
      if (req.headers['accept']?.includes('*')) {
        res.redirect(`/blog/${url}`)
        return
      }
      if (!req.params.url?.startsWith('@')) {
        const user = await getLocalUserByUrlCache(url)
        if (user && user.banned) {
          res.sendStatus(410)
          return
        }
        if (user && !user.banned) {
          if (!(await checkuserAllowsThreads(req, user))) {
            res.sendStatus(403)
            return
          }
          const userForFediverse = await userToJSONLD(user)
          res.set({
            'content-type': 'application/activity+json'
          })
          return res.send(userForFediverse)
        } else {
          return404(res)
        }
      } else {
        return404(res)
      }
      res.end()
    }
  )

  app.get(
    '/fediverse/blog/:url/following',
    getCheckFediverseSignatureFunction(false),
    async (req: SignedRequest, res: Response) => {
      if (req.params?.url) {
        const url = req.params.url.toLowerCase()
        const user = await getLocalUserByUrlCache(url)
        if (user && user.banned) {
          res.sendStatus(410)
          return
        }
        if (user && !user.banned) {
          if (!(await checkuserAllowsThreads(req, user)) || user.hideFollows) {
            res.sendStatus(403)
            return
          }
          const followedUsers = await getFollowedRemoteIds(user.id)
          let response: any
          if (req.query?.page) {
            const page = parseInt(req.query.page as string)
            const pageSize = 10
            const itemsToSend = followedUsers.slice((page - 1) * pageSize, page * pageSize)
            response = {
              '@context': 'https://www.w3.org/ns/activitystreams',
              id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following?page=${page}`,
              type: 'OrderedCollectionPage',
              partOf: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following`,
              orderedItems: itemsToSend
            }
            if (page > 1) {
              response['prev'] = `${
                completeEnvironment.frontendUrl
              }/fediverse/blog/${user.url.toLowerCase()}/following?page=${page - 1}`
            }
            if (followedUsers.length > pageSize * page) {
              response['next'] = `${
                completeEnvironment.frontendUrl
              }/fediverse/blog/${user.url.toLowerCase()}/following?page=${page + 1}`
            }
          } else {
            response = {
              '@context': 'https://www.w3.org/ns/activitystreams',
              id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following`,
              type: 'OrderedCollection',
              totalItems: followedUsers.length,
              partOf: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following`,
              first: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following?page=1`
            }
          }
          res.set({
            'content-type': 'application/activity+json'
          })
          res.send(response)
        } else {
          return404(res)
        }
      } else {
        return404(res)
      }
      res.end()
    }
  )

  app.get(
    '/fediverse/blog/:url/followers',
    getCheckFediverseSignatureFunction(false),
    async (req: SignedRequest, res: Response) => {
      if (req.params?.url) {
        const url = req.params.url.toLowerCase()
        const user = await getLocalUserByUrlCache(url)
        if (user && user.banned) {
          res.sendStatus(410)
          return
        }
        if (user && !user.banned) {
          if (!(await checkuserAllowsThreads(req, user)) || user.hideFollows) {
            res.sendStatus(403)
            return
          }
          const followers = await getFollowerRemoteIds(user.id)
          const followersNumber = followers.length
          let response: any
          if (req.query?.page) {
            const page = parseInt(req.query.page as string)
            const pageSize = 10
            const itemsToSend = followers.slice((page - 1) * pageSize, page * pageSize)
            response = {
              '@context': 'https://www.w3.org/ns/activitystreams',
              id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers?page=${
                req.query.page
              }`,
              type: 'OrderedCollectionPage',
              orderedItems: itemsToSend,
              totalItems: followersNumber
            }
            if (page > 1) {
              response['prev'] = `${
                completeEnvironment.frontendUrl
              }/fediverse/blog/${user.url.toLowerCase()}/followers?page=${page - 1}`
            }
            if (followers.length > pageSize * page) {
              response['next'] = `${
                completeEnvironment.frontendUrl
              }/fediverse/blog/${user.url.toLowerCase()}/followers?page=${page + 1}`
            }
          } else {
            response = {
              '@context': 'https://www.w3.org/ns/activitystreams',
              id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`,
              type: 'OrderedCollection',
              totalItems: followersNumber,
              first: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers?page=1`
            }
          }
          res.set({
            'content-type': 'application/activity+json'
          })
          res.send(response)
        } else {
          return404(res)
        }
      } else {
        return404(res)
      }
      res.end()
    }
  )

  app.get(
    '/fediverse/blog/:url/featured',
    getCheckFediverseSignatureFunction(true),
    async (req: SignedRequest, res: Response) => {
      if (req.params?.url) {
        const url = req.params.url.toLowerCase()
        const user = await getLocalUserByUrlCache(url)
        if (user && user.banned) {
          res.sendStatus(410)
          return
        }
        if (user) {
          if (!(await checkuserAllowsThreads(req, user))) {
            res.sendStatus(403)
            return
          }

          const cacheKey = getFeaturedCollectionCacheKey(user.id)
          const cachedCollection = await redisCache.get(cacheKey)
          if (cachedCollection) {
            res.set({
              'content-type': 'application/activity+json'
            })
            res.send(JSON.parse(cachedCollection))
            res.end()
            return
          }

          const pinnedPosts = await Post.findAll({
            where: {
              userId: user.id,
              isReblog: false,
              featured: { [Op.ne]: null },
              privacy: { [Op.in]: [Privacy.Public, Privacy.Unlisted] }
            },
            order: [['featured', 'DESC']],
            attributes: ['id']
          })

          const orderedItems = (await Promise.all(pinnedPosts.map((post) => postToJSONLD(post.id)))).filter(
            (post): post is activityPubObject => !!post
          )

          const collection = {
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/featured`,
            type: 'OrderedCollection',
            totalItems: orderedItems.length,
            orderedItems
          }
          await redisCache.set(cacheKey, JSON.stringify(collection), 'EX', 300)

          res.set({
            'content-type': 'application/activity+json'
          })
          res.send(collection)
        } else {
          return404(res)
        }
      } else {
        return404(res)
      }
      res.end()
    }
  )

  // HERE is where the meat and potatoes are. This endpoint is what we use to recive stuff
  app.post(
    ['/fediverse/blog/:url/inbox', '/fediverse/sharedInbox'],
    getCheckFediverseSignatureFunction(true),
    async (req: SignedRequest, res: Response) => {
      const urlToSearch = req.params?.url ? req.params.url : completeEnvironment.adminUser
      const url = urlToSearch.toLowerCase()
      const user = await getLocalUserByUrlCache(url)
      if (user && user.url !== completeEnvironment.adminUser && !(await checkuserAllowsThreads(req, user))) {
        res.sendStatus(403)
        return
      }
      if (user && user.banned) {
        res.sendStatus(410)
        return
      }
      if (user) {
        res.sendStatus(200)
        await inboxQueue.add('processInbox', {
          petition: req.body,
          petitionBy: user.id
        })
      } else {
        return404(res)
      }
      res.end()
    }
  )

  app.get(
    '/fediverse/blog/:url/outbox',
    getCheckFediverseSignatureFunction(false),
    async (req: SignedRequest, res: Response) => {
      if (req.params?.url) {
        const url = req.params.url.toLowerCase()
        const user = await getLocalUserByUrlCache(url)
        if (user && user.banned) {
          res.sendStatus(410)
          return
        }
        if (user) {
          res.sendStatus(200)
        } else {
          return404(res)
        }
      } else {
        return404(res)
      }
      res.end()
    }
  )

  app.get('/fediverse/emoji/:id', async (req: Request, res: Response) => {
    const id = req.params.id
    const emoji = await Emoji.findByPk(id)
    if (emoji) {
      res.set({
        'content-type': 'application/activity+json'
      })
      res.send({
        '@context': [
          'https://www.w3.org/ns/activitystreams',
          {
            toot: 'http://joinmastodon.org/ns#',
            Emoji: 'toot:Emoji',
            focalPoint: { '@container': '@list', '@id': 'toot:focalPoint' }
          }
        ],
        id: completeEnvironment.frontendUrl + '/fediverse/emoji/' + id,
        type: 'Emoji',
        name: emoji.name,
        updated: emoji.updatedAt,
        icon: {
          type: 'Image',
          mediaType: 'image/png',
          url: completeEnvironment.mediaUrl + emoji.url
        }
      })
    } else {
      res.sendStatus(404)
    }
  })

  if (completeEnvironment.frontendEnvironment.enableRawOutput) {
    app.get('/fediverse/post/:id/raw', async (req: Request, res: Response) => {
      const id = req.params.id
      const jsonLd = await postToJSONLD(id)
      if (jsonLd) {
        res
          .set({
            'content-type': 'application/activity+json'
          })
          .send(jsonLd)
      } else {
        return404(res)
      }
    })
  }

  app.get('/fediverse/post/:id/replies', async (req: Request, res: Response) => {
    res.send({
      type: 'CollectionPage',
      partOf: `${completeEnvironment.frontendUrl}/fediverse/post/${req.params?.id as string}/replies`,
      items: await getPostReplies(req.params?.id as string)
    })
  })

  app.get(
    '/fediverse/quote_request/:id',
    getCheckFediverseSignatureFunction(true),
    async (req: SignedRequest, res: Response) => {
      const quote: any = await Quotes.findOne({
        include: [
          {
            model: Post,
            as: 'quotedPost'
          },
          {
            model: Post,
            as: 'quoterPost',
            include: [
              {
                model: User,
                as: 'user'
              }
            ]
          }
        ],
        where: {
          quoterPostId: req.params.id
        }
      })
      if (quote) {
        let objectToSend: activityPubObject = {
          '@context': [
            'https://www.w3.org/ns/activitystreams',
            `${completeEnvironment.frontendUrl}/contexts/litepub-0.1.jsonld`
          ],
          actor: `${completeEnvironment.frontendUrl}/fediverse/blog/${quote.dataValues.quoterPost.dataValues.user.url}`,
          id: `${completeEnvironment.frontendUrl}/fediverse/quote_request/${req.params.id}`,
          type: 'QuoteRequest',
          object: await getPostUrlForQuote(quote.dataValues.quotedPost)
        }
        res.send(objectToSend)
      } else {
        res.sendStatus(404)
      }
    }
  )

  app.get('/fediverse/accept/:id', (req: SignedRequest, res: Response) => {
    res.sendStatus(200)
  })
}

export { activityPubRoutes, getLocalUserByUrlCache, getFeaturedCollectionCacheKey }
