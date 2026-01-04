import { Application, Response } from 'express'
import { adminToken, authenticateToken } from '../utils/authenticateToken.js'
import { Blocks, FederatedHost, Post, PostReport, ServerBlock, User, sequelize } from '../models/index.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { server } from '../interfaces/server.js'
import { Op, WhereOptions } from 'sequelize'
import { redisCache } from '../utils/redis.js'
import sendEmail from '../utils/sendEmail.js'
import { UserAttributes } from '../models/user.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { logger } from '../utils/logger.js'
import { getAllLocalUserIds } from '../utils/cacheGetters/getAllLocalUserIds.js'
import { InviteCode } from '../models/inviteCode.js'
import { generateRandomStringInviteCode } from '../utils/generateRandomString.js'
import { federatePostHasBeenEdited } from '../utils/activitypub/editPost.js'

export default function adminRoutes(app: Application) {
  app.get('/api/admin/server-list', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send({
      servers: await FederatedHost.findAll()
    })
  })

  if (completeEnvironment.registrationLevel === 'INVITE') {
    app.get('/api/admin/invite-codes', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
      const inviteCodes = await InviteCode.findAll();
      const usersInvolved = await User.findAll({
        where: {
          id: {
            [Op.in]: [
              ...inviteCodes.map(x => x.createdByUserId),
              ...inviteCodes.map(x => x.usedByUserId ?? '').filter(x => !!x)
            ]
          }
        },
        order: [
          ['createdAt', 'DESC']
        ]
      })
      const inviteCodesMapped = inviteCodes.map(x => ({
        createdBy: usersInvolved.find(y => y.id === x.createdByUserId),
        usedBy: usersInvolved.find(y => y.id === x.usedByUserId),
        isUsedOrExpired: x.isUsedOrExpired,
        updatedAt: x.updatedAt,
        createdAt: x.createdAt,
        expiresIn: x.expirationDate,
        code: x.code
      }))
      res.send({
        invites: inviteCodesMapped.reverse()
      })
    })

    app.post('/api/admin/create-invite-code', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
      if (!req.jwtData) return res.sendStatus(401)

      const petitionBody: {
        code?: string,
        expirationDate: string
      } = req.body

      const inviteCode = await InviteCode.create({
        code: petitionBody.code?.trim() ? petitionBody.code : generateRandomStringInviteCode(),
        expirationDate: new Date(petitionBody.expirationDate),
        createdByUserId: req.jwtData.userId
      })

      res.send(inviteCode)
    })
  }

  app.post('/api/admin/server-update', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    const petitionBody: Array<server> = req.body
    if (petitionBody) {
      const hostsToUpdateIds = petitionBody.map((elem) => elem.id)
      const dbElements = await FederatedHost.findAll({
        where: {
          id: {
            [Op.in]: hostsToUpdateIds
          }
        }
      })
      let promises: Array<Promise<any>> = []
      dbElements.forEach(async (elemToUpdate: any) => {
        const newValue = petitionBody.find((elem) => elem.id === elemToUpdate.id)
        if (newValue) {
          elemToUpdate.bubbleTimeline = newValue.bubbleTimeline
          elemToUpdate.blocked = newValue.blocked
          elemToUpdate.detail = newValue.detail
          elemToUpdate.friendServer = newValue.friendServer
          promises.push(elemToUpdate.save())
          if (elemToUpdate.blocked) {
            // we add it to the blocked cache
            redisCache.set('server:' + elemToUpdate.displayName, 'true')
          } else {
            // we remove it from the blocked cache
            redisCache.set('server:' + elemToUpdate.displayName, 'false')
          }
          if (newValue.blocked) {
            const reportsToClose = await PostReport.findAll({
              include: [
                {
                  model: Post,
                  include: [
                    {
                      model: User,
                      as: 'user',
                      include: [
                        {
                          model: FederatedHost,
                          required: true,
                          where: {
                            id: elemToUpdate.id
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            })
            promises = promises.concat(reportsToClose?.map((report: any) => report.update({ resolved: true })))
          }
        }
      })
      await Promise.all(promises)
      await redisCache.del('allBlockedServers')
      res.send({})
    } else {
      res.send({})
    }
  })

  app.get('/api/admin/userBlockList', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send({
      userBlocks: await Blocks.findAll({
        include: [
          {
            model: User,
            as: 'blocker',
            attributes: ['url', 'avatar']
          },
          {
            model: User,
            as: 'blocked',
            attributes: ['url', 'avatar']
          }
        ],
        where: {
          [Op.or]: [
            {
              blockedId: {
                [Op.in]: await getAllLocalUserIds()
              }
            },
            {
              blockerId: {
                [Op.in]: await getAllLocalUserIds()
              }
            }
          ]
        }
      }),
      userServerBlocks: await ServerBlock.findAll({
        include: [
          {
            model: User,
            as: 'userBlocker',
            attributes: ['url', 'avatar']
          },
          {
            model: FederatedHost,
            as: 'blockedServer',
            attributes: ['displayName']
          }
        ]
      })
    })
  })

  app.get('/api/admin/reportCount', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send({
      reports: await PostReport.count({
        where: {
          resolved: false
        }
      })
    })
  })

  async function getReportList() {
    // god forgive me for the any
    let res = await PostReport.findAll({
      include: [
        {
          model: User,
          attributes: ['url', 'avatar', 'id']
        },
        {
          model: Post,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['url', 'avatar', 'id'],
              include: [
                {
                  model: FederatedHost,
                  attributes: ['id', 'displayName']
                }
              ]
            }
          ]
        }
      ]
    })
    // this is not the best way to do this. But this code doesnt get caled that much
    // also im sleepy and i have other things to do
    // so
    // TODO make this in a better way. You, unsuspecting person, do this properly!
    const reportsWithoutPost = res.filter((elem) => !elem.post)
    const usersToFillIds = reportsWithoutPost.map((elem) => elem.reportedUserId).filter((elem) => !!elem)
    const usersToFill = await User.scope('full').findAll({
      attributes: ['url', 'avatar', 'id'],
      where: {
        id: {
          [Op.in]: usersToFillIds
        }
      }
    })
    const userMap: Map<string, User> = new Map()
    usersToFill.forEach((elem) => {
      userMap.set(elem.id, elem)
    })

    return res.map((elem) => {
      let reporteduser = elem.post ? elem.post.user : (userMap.get(elem.reportedUserId) as User)
      return {
        id: elem.id,
        resolved: elem.resolved,
        severity: elem.severity,
        description: elem.description,
        userId: elem.userId,
        user: elem.user,
        postId: elem.postId,
        post: elem.post,
        reportedUserId: elem.reportedUserId ? elem.reportedUserId : elem.post.userId,
        reportedUser: reporteduser,
        createdAt: elem.createdAt
      }
    })
  }

  app.get('/api/admin/reportList', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send(await getReportList())
  })

  app.post('/api/admin/closeReport', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    const reportToBeClosed = await PostReport.findByPk(req.body.id)
    if (reportToBeClosed) {
      reportToBeClosed.resolved = true
      await reportToBeClosed.save()
    }
    res.send(await getReportList())
  })

  app.post('/api/admin/banUser', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    const userToBeBanned = await User.scope('full').findByPk(req.body.id)
    if (userToBeBanned && userToBeBanned.role != 10) {
      let emailSent
      if (userToBeBanned.email && req.body.message) {
        emailSent = sendEmail({
          email: userToBeBanned.email,
          subject: `Your account ${userToBeBanned.url} have been banned from ${completeEnvironment.instanceUrl}`,
          body: `<p>Hello, you have been banned from ${completeEnvironment.instanceUrl}. Reason: ${req.body.message}</p>\n`
        })
      }
      userToBeBanned.banned = true
      const userSaved = userToBeBanned.save()
      const reportUpdated = PostReport.update(
        {
          resolved: true
        },
        {
          where: {
            reportedUserId: req.body.id
          }
        }
      )
      await Promise.all([userSaved, reportUpdated, emailSent])
    }

    res.send({
      success: true
    })
  })

  app.post('/api/admin/forceNSFWUser', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    const userToBeNSFW = await User.scope('full').findByPk(req.body.id)
    if (userToBeNSFW) {
      userToBeNSFW.NSFW = true
      await userToBeNSFW.save()
      await PostReport.update(
        {
          resolved: true
        },
        {
          where: {
            reportedUserId: req.body.id
          }
        }
      )
      await Post.update(
        {
          content_warning: 'This user has been marked as NSFW and the post has been labeled automatically as NSFW'
        },
        {
          where: {
            userId: req.body.id,
            content_warning: ''
          }
        }
      )
    }
    res.send({
      success: true
    })
  })
  app.post('/api/admin/ignoreReport', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send(
      await PostReport.update(
        {
          resolved: true
        },
        {
          where: {
            id: req.body.id
          }
        }
      )
    )
  })
  app.post('/api/admin/reopenReport', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send(
      await PostReport.update(
        {
          resolved: false
        },
        {
          where: {
            id: req.body.id
          }
        }
      )
    )
  })

  async function getBannedUsers() {
    return await User.scope('full').findAll({
      where: {
        banned: true
      },
      attributes: ['id', 'url', 'avatar']
    })
  }

  app.get('/api/admin/getBannedUsers', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    res.send({
      users: await getBannedUsers()
    })
  })

  app.post('/api/admin/unbanUser', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    await User.update(
      {
        banned: false
      },
      {
        where: {
          id: req.body.id
        }
      }
    )
    res.send({
      users: await getBannedUsers()
    })
  })

  app.get(
    '/api/admin/getPendingApprovalUsers',
    authenticateToken,
    adminToken,
    async (req: AuthorizedRequest, res: Response) => {
      const whereConditions: WhereOptions<UserAttributes> = {
        activated: false,
        url: {
          [Op.notLike]: '%@%'
        },
        banned: false
      }
      if (!completeEnvironment.disableRequireSendEmail) {
        whereConditions.emailVerified = true
      }
      const notActiveUsers = await User.scope('full').findAll({
        where: whereConditions,
        attributes: ['id', 'url', 'avatar', 'description', 'email', 'registerIp']
      })
      res.send(notActiveUsers)
    }
  )

  app.post('/api/admin/activateUser', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    if (req.body.id) {
      const userToActivate = await User.scope('full').findByPk(req.body.id)
      if (userToActivate && userToActivate.email) {
        userToActivate.activated = true
        const emailPromise = sendEmail({
          email: userToActivate.email,
          subject: `Your account at ${completeEnvironment.frontendUrl} has been activated`,
          body: `\
<p>Hello ${userToActivate.url}, your account has been reviewed by our team and is now activated!</p>
`
        })
        Promise.allSettled([emailPromise, userToActivate.save()])
      }
    }
    res.send({ success: true })
  })

  app.post('/api/admin/userUsedVPN', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    if (req.body.id) {
      const userToDelete = await User.scope('full').findByPk(req.body.id)
      if (userToDelete && userToDelete.email) {
        const emailPromise = sendEmail({
          email: userToDelete.email,
          subject: `Registrations at ${completeEnvironment.frontendUrl} through a vpn are not allowed`,
          body: `\
<h1>Hello ${userToDelete.url}, we have got a lot of spammers registering with vpns.</h1>
<p>Please do <a href="${completeEnvironment.frontendUrl}/register">try registering again without a vpn</a> or <b>on a different internet connection</b>. Corporate work networks usually get flagged as VPN</p>
<p>This is one of the many ways we avoid spam.</p>
<p>There is also only so much gore you can see before you say “fuck this shit”.</p>
<p>I am sorry. I promise that I won't do evil shit with your data, nor will I sell it or anything.</p>
<p>Your email has been cleared if you want to join again without a vpn.</p>
<p>Thanks for your understanding.</p>
`
        })
        await userToDelete.destroy()
        Promise.allSettled([emailPromise])
      }
    }
    res.send({ success: true })
  })

  app.post(
    '/api/admin/notActivateAndSendEmail',
    authenticateToken,
    adminToken,
    async (req: AuthorizedRequest, res: Response) => {
      if (req.body.id) {
        const userToActivate = await User.scope('full').findByPk(req.body.id)
        if (userToActivate && userToActivate.email) {
          userToActivate.activated = null // little hack, not adding another thing to the db. we set it to null and remove notification
          userToActivate.banned = null
          const emailPromise = sendEmail({
            email: userToActivate.email,
            subject: `${userToActivate.url} before we can activate your account at ${completeEnvironment.frontendUrl} we need you to reply to this email`,
            body: `\
<p>Hello ${userToActivate.url}, you received this email because something might be off in your account. \
Usually is something like the email being in a strange provider or 'wow that email looks weird'. \
We just need a confirmation. Sorry for this and thanks.</p>
`
          })
          Promise.allSettled([userToActivate.save(), emailPromise])
        }
      }
      res.send({ success: true })
    }
  )

  app.post('/api/admin/forceCWPost', authenticateToken, adminToken, async (req: AuthorizedRequest, res: Response) => {
    const postId = req.body.id
    const content_warning = req.body.content_warning

    const post = await Post.findByPk(postId)
    if(post) {
      post.content_warning = 'Mod team forced CW: ' + content_warning
      await post.save();
      await federatePostHasBeenEdited(post);
      await PostReport.update(
        {
        resolved: true
      },{
        where: {
          postId: post.id
        }
      }
    )
      res.send({success: true})
    } else {
      res.sendStatus(404)
    }
  })
}
