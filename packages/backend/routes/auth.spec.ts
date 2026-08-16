import express, { Application } from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Follows, Notification, User, UserOptions, sequelize } from '../models/index.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'

const BLUESKY_REGISTRATION_OPTION_NAME = 'wafrn.blueskyRegistrationOption'

const sendEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../utils/sendEmail.js', () => {
  return { default: sendEmailMock }
})

const optimizeMediaMock = vi.fn().mockResolvedValue('uploads/fake.webp')
vi.mock('../utils/optimizeMedia.js', () => {
  return { default: optimizeMediaMock }
})

const queueAddMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../utils/queues.js', () => {
  return {
    getQueue: vi.fn().mockReturnValue({ add: queueAddMock })
  }
})

vi.mock('../utils/rateLimiters.js', () => {
  const passthrough = (req: unknown, res: unknown, next: () => void) => next()
  return {
    createAccountLimiter: passthrough,
    onePerSecondLimiter: passthrough,
    loginRateLimiter: passthrough
  }
})

vi.mock('../utils/logger.js', () => {
  const noop = vi.fn()
  return { logger: { info: noop, error: noop, warn: noop, debug: noop, trace: noop } }
})

const { authRoutes } = await import('./auth.js')

function buildApp(): Application {
  const app = express()
  authRoutes(app)
  return app
}

function overAgeBirthDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 25)
  return date.toISOString()
}

async function cleanupTestUser(email: string) {
  const user = await User.scope('full').findOne({ where: { email } })
  if (!user) return
  await Notification.destroy({ where: { userId: user.id } })
  await Follows.destroy({ where: { followerId: user.id } })
  await UserOptions.destroy({ where: { userId: user.id } })
  await User.destroy({ where: { id: user.id } })
}

let emailsToCleanup: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  await Promise.all(emailsToCleanup.map(cleanupTestUser))
  emailsToCleanup = []
})

afterAll(async () => {
  await sequelize.close()
})

describe('POST /api/register', () => {
  it('creates a new account from a well-formed multipart registration request', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `register-${suffix}@testmail.com`
    const url = `reguser${suffix}`
    emailsToCleanup.push(email)

    const app = buildApp()

    const response = await request(app)
      .post('/api/register')
      .field('email', email)
      .field('password', 'testPassword123')
      .field('url', url)
      .field('description', 'I am a test user')
      .field('birthDate', overAgeBirthDate())
      .field('captchaResponse', '')
      .field('avatar', '')
      .field('confirmReadAbout', 'true')
      .field('blueskyOption', '1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })

    const createdUser = await User.scope('full').findOne({ where: { email } })
    expect(createdUser).not.toBeNull()
    expect(createdUser!.url).toBe(url)
    expect(createdUser!.description).toBe('I am a test user')
    expect(createdUser!.activated).toBe(false)
    expect(createdUser!.password).not.toBe('testPassword123')
    expect(await bcrypt.compare('testPassword123', createdUser!.password!)).toBe(true)

    const adminUser = await getAdminUser()
    const followRow = await Follows.findOne({
      where: { followerId: createdUser!.id, followedId: adminUser.id }
    })
    expect(followRow).not.toBeNull()

    const userOption = await UserOptions.findOne({
      where: { userId: createdUser!.id, optionName: BLUESKY_REGISTRATION_OPTION_NAME }
    })
    expect(userOption?.optionValue).toBe('1')

    expect(queueAddMock).toHaveBeenCalledWith('generateUserKeyPair', { userId: createdUser!.id })
  })

  it('rejects registration when the account is under the minimum age', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `toonewuser-${suffix}@testmail.com`
    emailsToCleanup.push(email)

    const app = buildApp()

    const response = await request(app)
      .post('/api/register')
      .field('email', email)
      .field('password', 'testPassword123')
      .field('url', `toonew${suffix}`)
      .field('description', 'too young')
      .field('birthDate', new Date().toISOString())
      .field('confirmReadAbout', 'true')
      .field('blueskyOption', '1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ success: false, error: true, message: 'Invalid age' })

    const foundUser = await User.scope('full').findOne({ where: { email } })
    expect(foundUser).toBeNull()
  })

  it('does not leak whether an email/url is already registered', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `dupeuser-${suffix}@testmail.com`
    const url = `dupeuser${suffix}`
    emailsToCleanup.push(email)

    const app = buildApp()
    const registerRequest = () =>
      request(app)
        .post('/api/register')
        .field('email', email)
        .field('password', 'testPassword123')
        .field('url', url)
        .field('description', 'I am a test user')
        .field('birthDate', overAgeBirthDate())
        .field('confirmReadAbout', 'true')
        .field('blueskyOption', '1')

    const firstResponse = await registerRequest()
    expect(firstResponse.status).toBe(200)
    expect(firstResponse.body).toEqual({ success: true })

    const secondResponse = await registerRequest()
    expect(secondResponse.status).toBe(200)
    expect(secondResponse.body).toEqual({ success: true })

    const matchingUsers = await User.scope('full').findAll({ where: { email } })
    expect(matchingUsers).toHaveLength(1)
  })
})
