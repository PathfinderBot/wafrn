import { Application, Request, Response } from 'express'
import { Op } from 'sequelize'
import sequelize from 'sequelize/lib/sequelize'
import { User, Post, FederatedHost } from '../../models/index.js'
import { getAllLocalUserIds } from '../../utils/cacheGetters/getAllLocalUserIds.js'
import { return404 } from '../../utils/return404.js'
import fs from 'fs'

// @ts-ignore cacher has no types
import Cacher from 'cacher'
import { Privacy } from '../../models/post.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { redisCache } from '../../utils/redis.js'
import { version } from 'os'
import { getAdminUser } from '../../utils/getAdminAndDeletedUser.js'
import { getLocalUserByUrlCache } from './activitypub.js'
import { id_v1, wafrnContext, ALL_LITEPUB_CONTEXT_PATHS } from '../../activitypub/contexts.js'
const cacher = new Cacher()

function wellKnownRoutes(app: Application) {
  // webfinger protocol
  app.get('/.well-known/host-meta', (req: Request, res) => {
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?><XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0"><Link rel="lrdd" template="${completeEnvironment.frontendUrl}/.well-known/webfinger?resource={uri}"/></XRD>`
    )
    res.end()
  })
  app.get('/.well-known/webfinger/', async (req: Request, res: Response) => {
    if (req.query?.resource) {
      const urlQueryResource: string = req.query.resource as string
      if (
        urlQueryResource.startsWith('acct:') &&
        (urlQueryResource.endsWith(completeEnvironment.instanceUrl) ||
          urlQueryResource.startsWith(`acct:${completeEnvironment.frontendUrl}/fediverse/blog/`))
      ) {
        const userUrl = urlQueryResource.endsWith(completeEnvironment.instanceUrl)
          ? urlQueryResource.slice(5).slice(0, -(completeEnvironment.instanceUrl.length + 1))
          : urlQueryResource.slice(`acct:${completeEnvironment.frontendUrl}/fediverse/blog/`.length)
        const user = await getLocalUserByUrlCache(userUrl.toLocaleLowerCase())
        if (!user || user.url.startsWith('@')) {
          return return404(res)
        }
        const response = {
          subject: urlQueryResource,
          aliases: [
            `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
            `${completeEnvironment.frontendUrl}/blog/${user.url.toLowerCase()}`
          ],
          links: [
            {
              rel: 'self',
              type: 'application/activity+json',
              href: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`
            },
            {
              rel: 'http://ostatus.org/schema/1.0/subscribe',
              template: `${completeEnvironment.frontendUrl}/authorize_interaction?uri={uri}`
            }
          ]
        }
        res.set({
          'content-type': 'application/jrd+json; charset=utf-8'
        })
        res.send(response)
      } else {
        return404(res)
      }
    } else {
      return404(res)
    }
    res.end()
  })

  app.get('/.well-known/nodeinfo', (req, res) => {
    res.set({
      'content-type': 'application/activity+json'
    })
    res.send({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
          href: `${completeEnvironment.frontendUrl}/.well-known/nodeinfo/2.0`
        }
      ]
    })
    res.end()
  })

  app.get('/.well-known/nodeinfo/2.0', async (req, res) => {
    res.set({
      'content-type': 'application/activity+json'
    })
    const cacheResult = await redisCache.get('nodeInfoData')
    if (cacheResult) {
      return res.send(JSON.parse(cacheResult))
    }
    const localUsersIds = await getAllLocalUserIds()
    const localUsers = await User.count({
      where: {
        id: {
          [Op.in]: localUsersIds
        },
        banned: false,
        activated: true
      }
    })
    const adminUser = await getAdminUser()
    const activeUsersSixMonths = await User.count({
      where: {
        id: {
          [Op.in]: localUsersIds
        },
        [Op.or]: [
          {
            lastActiveAt: {
              [Op.gt]: new Date().setMonth(new Date().getMonth() - 6)
            }
          },
          {
            lastTimeNotificationsCheck: {
              [Op.gt]: new Date().setMonth(new Date().getMonth() - 6)
            }
          }
        ]
      }
    })
    const activeUsersLastMonth = await User.count({
      where: {
        id: {
          [Op.in]: localUsersIds
        },
        [Op.or]: [
          {
            lastActiveAt: {
              [Op.gt]: new Date().setMonth(new Date().getMonth() - 1)
            }
          },
          {
            lastTimeNotificationsCheck: {
              [Op.gt]: new Date().setMonth(new Date().getMonth() - 1)
            }
          }
        ]
      }
    })
    const packageJsonFile = JSON.parse(fs.readFileSync('package.json').toString())
    const result = {
      version: '2.0',
      software: {
        name: 'wafrn',
        version: packageJsonFile.version
      },
      protocols: ['activitypub'],
      services: {
        outbound: [],
        inbound: []
      },
      usage: {
        users: {
          total: localUsers,
          activeMonth: activeUsersLastMonth,
          activeHalfyear: activeUsersSixMonths
        },
        localPosts: await Post.count({
          where: {
            userId: {
              [Op.in]: localUsersIds
            },
            privacy: Privacy.Public
          }
        })
      },
      openRegistrations: completeEnvironment.registrationLevel !== 'PRIVATE',
      metadata: {
        nodeName: completeEnvironment.defaultSEOData.title,
        nodeDescription: completeEnvironment.defaultSEOData.description,
        nodeAdmins: [
          {
            name: '@' + adminUser.url,
            email: completeEnvironment.adminEmail
          }
        ],
        maintainer: {
          name: '@' + adminUser.url,
          email: completeEnvironment.adminEmail
        },
        inquiryUrl: `https://${completeEnvironment.instanceUrl}/fediverse/blog/${adminUser.url}`,
        adminAccount: `https://${completeEnvironment.instanceUrl}/fediverse/blog/${adminUser.url}`,
        themeColor: '#96d8d1',
        emailRequiredForSignup: true,
        disableRegistration: completeEnvironment.registrationLevel == 'PRIVATE'
      }
    }
    redisCache.set('nodeInfoData', JSON.stringify(result), 'EX', 3600 * 48)
    res.send(result)
    res.end()
  })
  app.get('/.well-known/assetlinks.json', (req, res) => {
    res.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'dev.djara.wafrn_rn',
          sha256_cert_fingerprints: [
            '09:1A:D9:44:84:3E:18:0C:43:22:ED:E2:02:A7:33:09:4C:DC:07:DD:1A:CD:51:52:3F:E8:13:EA:E9:04:F4:87'
          ]
        }
      }
    ])
  })
  app.get('/.well-known/apple-app-site-association', (req, res) => {
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: '837R3VKT4W.dev.djara.wafrn-rn',
            paths: ['*']
          }
        ]
      }
    })
  })
  app.get('/api/v1/instance', async (req, res) => {
    res.set({
      'content-type': 'application/activity+json'
    })
    const cacheResult = await redisCache.get('instanceData')
    if (cacheResult) {
      return res.send(JSON.parse(cacheResult))
    }
    const packageJsonFile = JSON.parse(fs.readFileSync('package.json').toString())
    const adminUser = await getAdminUser()
    const result = {
      uri: completeEnvironment.instanceUrl,
      title: completeEnvironment.defaultSEOData.title,
      description: completeEnvironment.defaultSEOData.description,
      email: completeEnvironment.adminEmail,
      version: packageJsonFile.version,
      registrations: completeEnvironment.registrationLevel === 'PUBLIC',
      invites_enabled: completeEnvironment.registrationLevel === 'INVITE',
      approval_required: completeEnvironment.reviewRegistrations,
      configuration: {
        accounts: {
          allow_custom_css: true
        }
      },
      contact_account: {
        id: `${completeEnvironment.frontendUrl}/fediverse/blog/${adminUser.url.toLowerCase()}`,
        username: adminUser.url,
        acct: adminUser.url,
        display_name: adminUser.name,
        bot: adminUser.isBot,
        note: adminUser.description,
        url: `${completeEnvironment.frontendUrl}/fediverse/blog/${adminUser.url.toLowerCase()}`,
        uri: `${completeEnvironment.frontendUrl}/fediverse/blog/${adminUser.url.toLowerCase()}`,
        avatar: completeEnvironment.mediaUrl + adminUser.avatar,
        avatar_static: completeEnvironment.mediaUrl + adminUser.avatar,
        banner: completeEnvironment.mediaUrl + adminUser.headerImage,
        banner_static: completeEnvironment.mediaUrl + adminUser.headerImage
      }
    }
    redisCache.set('instanceData', JSON.stringify(result), 'EX', 3600 * 48)
    res.send(result)
    res.end()
  })

  app.get('/api/v1/instance/peers', async (req, res) => {
    res.set({
      'content-type': 'application/activity+json'
    })
    const cacheResult = await redisCache.get('instancePeerData')
    if (cacheResult) {
      return res.send(JSON.parse(cacheResult))
    }
    const hosts = await FederatedHost.findAll()
    const result = hosts.map((h) => h.displayName)
    redisCache.set('instancePeerData', JSON.stringify(result), 'EX', 3600 * 48)
    res.send(result)
    res.end()
  })

  // serve every context path we've ever used (current + all legacy ones) with the current wafrnContext
  ALL_LITEPUB_CONTEXT_PATHS.forEach((path) =>
    app.get(path, (req: Request, res: Response) => res.json(wafrnContext))
  )
  app.get('/contexts/identity-v1.jsonld', (req: Request, res: Response) => res.json(id_v1))
}

export { wellKnownRoutes }
