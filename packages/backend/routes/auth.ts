import { Application, Response } from 'express'
import { Op } from 'sequelize'
import { MfaDetails, User, UserOptions, sequelize } from '../models/index.js'
import { InviteCode } from '../models/inviteCode.js'
import { adminToken, authenticateToken } from '../utils/authenticateToken.js'
import generateRandomString from '../utils/generateRandomString.js'
import getIp from '../utils/getIP.js'
import sendEmail from '../utils/sendEmail.js'
import validateEmail from '../utils/validateEmail.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import optimizeMedia from '../utils/optimizeMedia.js'
import uploadHandler from '../utils/uploads.js'
import { randomUUID } from 'crypto'
import { logger } from '../utils/logger.js'
import {
  createAccountLimiter,
  loginRateLimiter,
  onePerSecondLimiter
} from '../utils/rateLimiters.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import optionalAuthentication from '../utils/optionalAuthentication.js'
import { redisCache } from '../utils/redis.js'
import showdown from 'showdown'
import { AtpAgent } from '@atproto/api'
import { getQueue } from '../utils/queues.js'
import * as OTPAuth from 'otpauth'
import verifyTotp from '../utils/verifyTotp.js'
import { follow } from '../services/follow.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { syncBskyAccountData } from '../atproto/utils/syncBskyAccountData.js'
import { createBskyAppPassword, forceUpdateBskyEmail, serviceUrl, updateBskyPassword } from '../services/bskyAccount.js'
import {
  applyBlueskyRegistrationOption,
  BLUESKY_REGISTRATION_OPTION_NAME,
  BlueskyRegistrationOption
} from '../utils/blueskyRegistrationOption.js'

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true
})
const forbiddenCharacters = [':', '@', '/', '<', '>', '"', '&', '?']

// timings attacks require us to check against something if no user found in db
let dummyPasswordHashPromise: Promise<string> | null = null
function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = bcrypt.hash(
      'wafrn-timing-normalization-dummy-password' + new Date().getTime(),
      completeEnvironment.saltRounds
    )
  }
  return dummyPasswordHashPromise
}

const generateUserKeyPairQueue = getQueue('generateUserKeyPair')

const slurs = [
  'chinaman',
  'chinamen',
  'chink',
  'coolie',
  'coon',
  'eskimo',
  'golliwog',
  'gook',
  'gyp',
  'gypsy',
  'half-breed',
  'halfbreed',
  'heeb',
  'jap',
  'kaffer',
  'kaffir',
  'kaffir',
  'kaffre',
  'kafir',
  'kike',
  'kraut',
  'negress',
  'negro',
  'nig',
  'nig-nog',
  'nigga',
  'nigger',
  'nigguh',
  'pajeet',
  'paki',
  'pickaninnie',
  'pickaninny',
  'raghead',
  'retard',
  'sambo',
  'shemale',
  'soyboy',
  'spade',
  'sperg',
  'spic',
  'squaw',
  'tard',
  'wetback',
  'wigger',
  'wop',
  'yid'
]

function authRoutes(app: Application) {
  app.post(
    '/api/register',
    ...(completeEnvironment.registrationLevel === 'PRIVATE'
      ? [authenticateToken, adminToken, createAccountLimiter, onePerSecondLimiter]
      : [createAccountLimiter, onePerSecondLimiter]),
    uploadHandler().single('avatar'),
    async (req, res) => {
      try {
        let success = false
        if (
          req.body?.email &&
          req.body.url &&
          req.body.url.match(/^[a-z0-9_A-Z]+([\_-]+[a-z0-9_A-Z]+)*$/i) &&
          validateEmail(req.body.email) &&
          !slurs.includes(req.body.url.toLowerCase())
        ) {
          const birthDate = new Date(req.body.birthDate)
          const minimumAge = new Date()
          minimumAge.setFullYear(new Date().getFullYear() - completeEnvironment.minimumAgeToRegister)
          if (birthDate.getTime() > minimumAge.getTime()) {
            res.status(403).send({ success: false, error: true, message: 'Invalid age' })
            return
          }
          const emailExists = await User.scope('full').findOne({
            where: {
              [Op.or]: [
                { email: req.body.email.toLowerCase() },
                sequelize.where(sequelize.fn('lower', sequelize.col('url')), req.body.url.toLowerCase())
              ]
            }
          })

          let inviteCode: InviteCode | undefined
          if (!emailExists) {
            const id = randomUUID()
            const parsedBlueskyOption = parseInt(req.body.blueskyOption, 10)
            const blueskyOption = [
              BlueskyRegistrationOption.NoThanks,
              BlueskyRegistrationOption.CreateNew,
              BlueskyRegistrationOption.BringOwn
            ].includes(parsedBlueskyOption)
              ? (parsedBlueskyOption as BlueskyRegistrationOption)
              : BlueskyRegistrationOption.NoThanks
            if (completeEnvironment.registrationLevel === 'INVITE') {
              // we get invite code first
              if (!req.body.inviteCode) {
                return res.status(403).send({
                  success: false,
                  error: true,
                  message: 'Invalid invite code'
                })
              }

              const invite = req.body.inviteCode as string

              const inviteDef = await InviteCode.findOne({
                where: {
                  code: invite
                }
              })

              if (!inviteDef || inviteDef.isUsedOrExpired) {
                return res.status(400).send({ success: false, message: 'Invalid invite code' })
              }

              inviteCode = inviteDef
            }

            let avatarURL = '' // Empty user avatar in case of error let frontend do stuff
            if (req.file != null) {
              avatarURL = `/${await optimizeMedia(req.file.path, {
                forceImageExtension: 'webp'
              })}`
            }
            if (completeEnvironment.removeFolderNameFromFileUploads) {
              avatarURL = avatarURL.slice('/uploads/'.length - 1)
            }
            const activationCode = generateRandomString()
            const user = {
              id: id,
              email: req.body.email.toLowerCase(),
              description: req.body.description.trim(),
              descriptionMarkdown: markdownConverter.makeHtml(req.body.description.trim()),
              url: req.body.url.trim().replace(' ', '_'),
              name: req.body.name ? req.body.name : req.body.url.trim().replace(' ', '_'),
              NSFW: req.body.nsfw === 'true',
              password: await bcrypt.hash(req.body.password, completeEnvironment.saltRounds),
              birthDate: new Date(req.body.birthDate),
              avatar: avatarURL,
              activated: false,
              registerIp: getIp(req),
              lastLoginIp: 'ACCOUNT_NOT_ACTIVATED',
              banned: false,
              activationCode,
              isBot: false,
              lastTimeNotificationsCheck: new Date(0),
              lastActiveAt: new Date(0),
              hideProfileNotLoggedIn: false,
              hideFollows: false,
              emailVerified: false
            }

            const userWithEmail = await User.create(user)

            if (inviteCode) {
              await follow(id, inviteCode.createdByUserId)
              inviteCode.usedByUserId = id
              await inviteCode.save()
            }

            if (completeEnvironment.autoFollowAdmin) {
              const adminUser = await getAdminUser()
              await follow(id, adminUser.id)
            }

            const instanceUrl = completeEnvironment.instanceUrl.startsWith('http')
              ? completeEnvironment.instanceUrl
              : `https://${completeEnvironment.instanceUrl}`
            let instanceHost = completeEnvironment.instanceUrl
            try {
              instanceHost = new URL(instanceUrl).host
            } catch (err) {
              console.error('cannot use `completeEnvironment.instanceUrl` in `new URL` constructor')
            }

            const email = req.body.email.toLowerCase()
            const activationLink = `${instanceUrl}/activate/${encodeURIComponent(email)}/${activationCode}`
            const emailSent = completeEnvironment.disableRequireSendEmail
              ? true
              : sendEmail({
                  email,
                  subject: `Welcome to ${instanceHost}, please verify your email!`,
                  body: `\
<h1>Welcome to ${instanceUrl}</h1>
<p>To activate your account, <a href="${activationLink}">verify your email</a>.</p>
<br />
<p>If you can't see the link above, copy this link: ${activationLink}</p>
`
                })
            await Promise.all([userWithEmail, emailSent])
            if (blueskyOption !== BlueskyRegistrationOption.NoThanks) {
              await UserOptions.create({
                userId: id,
                optionName: BLUESKY_REGISTRATION_OPTION_NAME,
                optionValue: String(blueskyOption),
                public: false
              })
            }
            await generateUserKeyPairQueue.add('generateUserKeyPair', {
              userId: (await userWithEmail).id
            })
            success = true
            await redisCache.del('allLocalUserIds')
            res.send({
              success: true
            })
          } else {
            logger.info({
              message: 'Email exists',
              email: req.body?.email,
              url: req.body.url,
              forbidChar: !forbiddenCharacters.some((char) => req.body.url.includes(char)),
              emailValid: validateEmail(req.body.email)
            })
            // we shall not leak if user exists
            success = true
            res.send({
              success: true
            })
          }
        } else {
          logger.info({
            message: 'Failed registration',
            email: req.body?.email,
            url: req.body.url,
            forbidChar: !forbiddenCharacters.some((char) => req.body.url.includes(char)),
            emailValid: validateEmail(req.body.email)
          })
          res.status(400).send({
            success: false,
            message: 'Failed registration',
            email: req.body?.email,
            url: req.body.url,
            forbidChar: !forbiddenCharacters.some((char) => req.body.url.includes(char)),
            emailValid: validateEmail(req.body.email)
          })
          return
        }
        if (!success) {
          res.status(401).send({
            success: false,
            message: 'Failed registration'
          })
        }
      } catch (error) {
        logger.error(error)
        res.status(500).send({ success: false, error })
      }
    }
  )

  app.post('/api/forgotPassword', createAccountLimiter, onePerSecondLimiter, async (req, res) => {
    const resetCode = generateRandomString()
    try {
      if (req.body?.email && validateEmail(req.body.email)) {
        const email = req.body.email.toLowerCase()
        const user = await User.scope('full').findOne({ where: { email } })
        if (user) {
          user.activationCode = resetCode
          user.requestedPasswordReset = new Date()
          user.save()

          const link = `${completeEnvironment.instanceUrl}/resetPassword/${encodeURIComponent(email)}/${resetCode}`
          const appLink = `wafrn://complete-password-reset?email=${encodeURIComponent(email)}&code=${resetCode}`

          // for timing we dont use await we just send it "fire and forget"
          sendEmail({
            email: req.body.email.toLowerCase(),
            subject: `Reset ${completeEnvironment.instanceUrl} password`,
            body: `\
<h1>So you forgot your ${completeEnvironment.instanceUrl} password</h1>
<p>If you requested this you may <a href="${link}">reset your password on the web</a> or <a href="${appLink}">reset your password on the app</a></p>
<p>If you can't see the web link above, copy this link: ${link}</p>
<p>If you didn't request this, ignore this email.</p>
`
          }).catch((error) => {
            logger.error({
              message: 'Error sending forgotPassword email',
              error
            })
          })
        }
      }
    } catch (error) {
      logger.error(error)
    }

    res.send({ success: true })
  })

  app.post('/api/activateUser', onePerSecondLimiter, createAccountLimiter, async (req, res) => {
    let success = false
    if (req.body?.email && validateEmail(req.body.email) && req.body.code) {
      const user = await User.scope('full').findOne({
        where: {
          email: req.body.email.toLowerCase(),
          activationCode: req.body.code
        }
      })
      if (user) {
        user.emailVerified = true
        let body = ''
        let subject = ''
        if (!completeEnvironment.reviewRegistrations) {
          user.activated = true
          subject = `Your ${completeEnvironment.instanceUrl} account ${user.url} has been activated`
          body = '<p>;D</p>' + (await applyBlueskyRegistrationOption(user))
        } else {
          subject = `The email account for your ${completeEnvironment.instanceUrl} account is now being reviewd by an admin!`
          body = `\
<p>Thanks for verifying your email, Our admin team will review your registration request soon!</p>
<p>We do check registrations to avoid spam and harrasment campaigns, your safety is important<p>
`
        }
        try {
          await Promise.all([user.save(), sendEmail({ email: req.body.email.toLowerCase(), subject, body })])
          success = true
        } catch (error) {
          logger.info({
            message: `Error while activating account`,
            error: error
          })
        }
      }
    }

    if (!success) {
      logger.info({
        message: `Success marked as false on activate account!`,
        body: req.body
      })
    }

    res.send({
      success
    })
  })

  app.post('/api/resetPassword', createAccountLimiter, onePerSecondLimiter, async (req, res) => {
    let success = false

    try {
      if (req.body?.email && req.body.code && req.body.password && validateEmail(req.body.email)) {
        // Codes are only valid if the reset was requested within the last 2 hours.
        // (Previously this compared `requestedPasswordReset < now + 2h`, which is
        // true for any past timestamp and therefore never expired anything.)
        const resetPasswordWindowStart = new Date()
        resetPasswordWindowStart.setTime(resetPasswordWindowStart.getTime() - 3600 * 2 * 1000)
        const user = await User.scope('full').findOne({
          where: {
            email: req.body.email.toLowerCase(),
            activationCode: req.body.code,
            requestedPasswordReset: { [Op.gt]: resetPasswordWindowStart }
          }
        })
        if (user) {
          await updatePassword(user, req.body.password)
          // Invalidate the code so it cannot be reused/brute-forced further.
          user.activationCode = generateRandomString()
          user.requestedPasswordReset = null as unknown as Date
          await user.save()

          success = true
        }
      }
    } catch (error) {
      logger.error(error)
    }

    res.send({
      success
    })
  })

  app.post('/api/changePassword', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const user = (await User.findByPk(req.jwtData?.userId as string)) as User
    const password = req.body.oldPassword
    const newPassword = req.body.newPassword
    if (await bcrypt.compare(password, user.password)) {
      await updatePassword(user, newPassword)
      return res.send({ success: true })
    }

    res.status(403)
    return res.send({
      success: false,
      message: 'Incorrect password'
    })
  })

  app.post('/api/changeEmail', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    try {
      const userId = req.jwtData?.userId as string
      const user = (await User.scope('full').findByPk(userId)) as User
      const password = req.body.password
      const newEmail = req.body.email

      if (!user) {
        return res.status(404).send({
          success: false,
          message: 'User not found'
        })
      }

      if (!password) {
        return res.status(400).send({
          success: false,
          message: '"password" is required in body'
        })
      }

      if (!newEmail) {
        return res.status(400).send({
          success: false,
          message: '"email" is required in body'
        })
      }

      if (!validateEmail(newEmail)) {
        return res.status(400).send({
          success: false,
          message: 'Invalid email format'
        })
      }

      const passwordMatches = await bcrypt.compare(password, user.password)
      if (!passwordMatches) {
        return res.status(403).send({
          success: false,
          message: 'Incorrect password'
        })
      }

      // Check if email already exists (excluding current user)
      const emailExists = await User.findOne({
        where: {
          email: newEmail.toLowerCase(),
          id: { [Op.ne]: userId }
        }
      })

      if (emailExists) {
        return res.status(400).send({
          success: false,
          message: 'Email already in use'
        })
      }

      // Update email
      user.email = newEmail.toLowerCase()
      await user.save()

      // Force update bluesky email if bluesky is enabled
      if (user.enableBsky && user.bskyDid) {
        try {
          await forceUpdateBskyEmail(user)
          await syncBskyAccountData(user.id, { syncPosts: true, syncFollows: true })
        } catch (error) {
          logger.error({
            message: `Error updating bluesky email for user ${user.url}`,
            error: error
          })
          // Don't fail the entire request if bluesky sync fails
        }
      }

      res.send({ success: true })
    } catch (error) {
      logger.error(error)
      res.status(500).send({
        success: false,
        message: 'Error changing email'
      })
    }
  })

  app.post('/api/login', loginRateLimiter, onePerSecondLimiter, async (req, res) => {
    let success = false
    try {
      if (req.body?.email && req.body.password) {
        const userWithEmail = await User.scope('full').findOne({
          where: {
            email: req.body.email.toLowerCase().trim(),
            banned: {
              [Op.ne]: true
            }
          }
        })
        if (userWithEmail && userWithEmail.email) {
          const correctPassword = await bcrypt.compare(req.body.password, userWithEmail.password)
          if (correctPassword) {
            success = true
            if (userWithEmail.activated) {
              const mfaEnabled = await MfaDetails.findAll({
                where: {
                  userId: userWithEmail.id,
                  enabled: {
                    [Op.eq]: true
                  }
                }
              })
              if (mfaEnabled.length > 0) {
                res.send({
                  success: true,
                  mfaRequired: true,
                  mfaOptions: [...new Set(mfaEnabled.map((elem) => elem.type))],
                  token: jwt.sign(
                    {
                      mfaStep: 1,
                      email: userWithEmail.email.toLowerCase()
                    },
                    completeEnvironment.jwtSecret,
                    { expiresIn: '300s' }
                  )
                })
              } else {
                res.send({
                  success: true,
                  token: jwt.sign(
                    {
                      userId: userWithEmail.id,
                      email: userWithEmail.email.toLowerCase(),
                      birthDate: userWithEmail.birthDate,
                      url: userWithEmail.url,
                      role: userWithEmail.role
                    },
                    completeEnvironment.jwtSecret,
                    { expiresIn: '31536000s' }
                  )
                })
                userWithEmail.lastLoginIp = getIp(req)
                await userWithEmail.save()
              }
            } else {
              res.send({
                success: false,
                message: 'Please activate your account! Check your email'
              })
            }
          }
        } else {
          // timing attacks
          await bcrypt.compare(req.body.password, await getDummyPasswordHash())
        }
      }
    } catch (error) {
      logger.error(error)
    }

    if (!success) {
      // res.statusCode = 401;
      res.send({
        success: false,
        message: 'Please recheck your email and password'
      })
    }
  })

  app.post(
    '/api/login/mfa',
    [loginRateLimiter, optionalAuthentication, onePerSecondLimiter],
    async (req: AuthorizedRequest, res: any) => {
      let success = false
      try {
        if (req.body?.token && req.jwtData?.mfaStep == 1 && req.jwtData?.email) {
          const userWithEmail = await User.scope('full').findOne({
            where: {
              email: req.jwtData?.email,
              banned: {
                [Op.ne]: true
              }
            }
          })
          if (userWithEmail) {
            const mfaDetails = await MfaDetails.findAll({
              where: {
                userId: userWithEmail.id,
                enabled: {
                  [Op.eq]: true
                }
              }
            })

            let mfaPassed = false

            for (let mfaDetail of mfaDetails) {
              if (await verifyTotp(mfaDetail, req.body?.token)) {
                mfaPassed = true
                break
              }
            }

            if (mfaPassed) {
              success = true
              res.send({
                success: true,
                token: jwt.sign(
                  {
                    userId: userWithEmail.id,
                    email: userWithEmail.email?.toLowerCase(),
                    birthDate: userWithEmail.birthDate,
                    url: userWithEmail.url,
                    role: userWithEmail.role
                  },
                  completeEnvironment.jwtSecret,
                  { expiresIn: '31536000s' }
                )
              })
              userWithEmail.lastLoginIp = getIp(req)
              await userWithEmail.save()
            }
          }
        }
      } catch (error) {
        logger.error(error)
      }

      if (!success) {
        // res.statusCode = 401;
        res.send({
          success: false,
          message: 'Invalid code provided'
        })
      }
    }
  )

  // list all registered MFA options for a user
  app.get('/api/user/mfa', authenticateToken, async (req: AuthorizedRequest, res) => {
    try {
      if (!req.jwtData?.userId) {
        // NOTE: 401 means "we need to know who you are", not "you are not authorized to do this" which would be code 403
        res.status(401).send({ success: false, message: 'Invalid JWT' })
        return
      }

      const mfaDetails = await MfaDetails.findAll({
        where: {
          userId: req.jwtData?.userId,
          enabled: {
            [Op.eq]: true
          }
        }
      })
      res.send({
        success: true,
        mfa: mfaDetails.map((detail) => ({
          id: detail.id,
          name: detail.name,
          type: detail.type,
          enabled: detail.enabled
        }))
      })
    } catch (error) {
      logger.error(error)
      res.status(500).send({ success: false, message: 'Error fetching MFA details' })
    }
  })

  app.post('/api/user/mfa', authenticateToken, async (req: AuthorizedRequest, res) => {
    try {
      if (!req.jwtData?.userId) {
        res.status(401).send({ success: false, message: 'Invalid JWT' })
        return
      }
      if (req.body?.type !== 'totp') {
        res.status(400).send({ success: false, message: 'Invalid MFA type' })
        return
      }

      const totpSettings: any = {
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }).base32
      }

      const mfaDetail = await MfaDetails.create({
        userId: req.jwtData?.userId,
        type: 'totp',
        name: req.body?.name || 'Authenticator App',
        data: totpSettings,
        enabled: false
      })

      totpSettings.issuer = completeEnvironment.instanceUrl
      totpSettings.label = req.jwtData?.email

      const totp = new OTPAuth.TOTP(totpSettings)

      res.send({
        success: true,
        mfa: {
          id: mfaDetail.id,
          type: mfaDetail.type,
          name: mfaDetail.name,
          secret: totpSettings.secret,
          qrString: totp.toString()
        }
      })
    } catch (error) {
      logger.error(error)
      res.status(500).send({ success: false, message: 'Error creating MFA detail' })
    }
  })

  app.post('/api/user/mfa/:id/verify', authenticateToken, async (req: AuthorizedRequest, res) => {
    try {
      if (!req.jwtData?.userId) {
        res.status(401).send({ success: false, message: 'Invalid JWT' })
        return
      }
      if (!req.body?.token) {
        res.status(400).send({ success: false, message: 'Token is required' })
        return
      }

      const mfaDetail = await MfaDetails.findOne({
        where: {
          id: req.params.id,
          userId: req.jwtData?.userId,
          enabled: {
            [Op.eq]: false
          }
        }
      })

      if (mfaDetail) {
        if (await verifyTotp(mfaDetail, req.body?.token)) {
          mfaDetail.enabled = true
          await mfaDetail.save()
          res.send({ success: true })
          return
        }
      } else {
        logger.info({
          message: 'MFA detail not found',
          userId: req.jwtData?.userId,
          mfaDetailId: req.params.id
        })
        res.status(500).send({ success: false })
        // NOTE: explicitly not sending 404 here because
        // we don't want to leak information about the existence of the MFA detail to the user
      }
    } catch (error) {
      logger.error(error)
      res.status(500).send({ success: false, message: 'Error verifying MFA token' })
    }
  })

  app.delete('/api/user/mfa/:id', authenticateToken, async (req: AuthorizedRequest, res) => {
    try {
      if (!req.jwtData?.userId) {
        res.status(401).send({ success: false, message: 'Invalid JWT' })
        return
      }
      if (!req.params.id) {
        res.status(400).send({ success: false, message: 'MFA detail ID is required' })
        return
      }
      const mfaDetail = await MfaDetails.findOne({
        where: {
          id: req.params.id,
          userId: req.jwtData?.userId
        }
      })
      if (mfaDetail) {
        await mfaDetail.destroy()
      }
      // NOTE: explicitly not sending 404 here because
      // we don't want to leak information about the existence of the MFA detail to the user
      res.send({ success: true })
    } catch (error) {
      logger.error(error)
    }
    res.send({ success: false })
  })

  app.post(
    '/api/user/selfDeactivate',
    authenticateToken,
    onePerSecondLimiter,
    createAccountLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      // frontend will warn user. User will recive email.
      const userId = req.jwtData?.userId as string
      const user = (await User.scope('full').findByPk(userId)) as User
      const password = req.body.password
      if (!password) {
        return res.status(400).send({
          success: false,
          message: '"password" is required in body'
        })
      }
      const passwordMatches = await bcrypt.compare(password, user.password)
      if (!passwordMatches) {
        return res.status(400).send({
          success: false
          // TODO: should we send a message to the user here or not?
        })
      }

      user.selfDeleted = true
      user.activated = false
      user.updatedAt = new Date()
      user.banned = true
      await user.save()
      try {
        await sendEmail({
          email: user.email as string,
          subject: `We have marked your ${completeEnvironment.instanceUrl} account for deletion`,
          body: `\
<h1>We are sad to see you go</h1>
<p>We have received your request to delete your account. It will still be visible for a few moments. \
In 24 hours or less we will complete the destruction process and at that point there will be no going back.</p>
<p>This is a slow process on our side and thats why its not done immediately.</p>
<p>The deletion task is run every day at night (02:00 UTC). \
It is slow because we have to send every fedi server that has ever seen a post of yours a "PLEASE DELETE. NOW" message and we send those one by one so this task takes time and slows down the server.</p>
<p>If within 2 days your account is not deleted, please contact your server admin.</p>
`
        })
      } catch (error) {
        logger.info(error)
      }

      res.send({ success: true })
    }
  )
}

async function updatePassword(user: User, password: string) {
  user.emailVerified = true
  user.password = await bcrypt.hash(password, completeEnvironment.saltRounds)
  user.activated = completeEnvironment.reviewRegistrations ? user.activated : true
  user.requestedPasswordReset = null
  await user.save()
  // also reset MFA details
  await MfaDetails.destroy({
    where: {
      userId: user.id
    }
  })
  // also update the bluesky password
  if (user.enableBsky && user.bskyDid) {
    await updateBskyPassword(user, password)
    const agent = new AtpAgent({
      service: serviceUrl
    })
    await agent.login({
      identifier: user.bskyDid as string,
      password: password
    })
    await createBskyAppPassword(user, agent)
  }
  return true
}

export { authRoutes }
