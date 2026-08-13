import express, { Application } from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const userCreateMock = vi.fn()
const userScopeFindOneMock = vi.fn()
const userOptionsCreateMock = vi.fn()

vi.mock('../models/index.js', () => {
  return {
    User: {
      scope: () => ({ findOne: userScopeFindOneMock }),
      create: userCreateMock
    },
    UserOptions: {
      create: userOptionsCreateMock
    },
    MfaDetails: {},
    sequelize: {
      where: vi.fn(),
      fn: vi.fn(),
      col: vi.fn()
    }
  }
})

vi.mock('../models/user.js', () => {
  return {
    User: {
      scope: () => ({ findOne: userScopeFindOneMock })
    }
  }
})

vi.mock('../utils/getAdminAndDeletedUser.js', () => {
  return {
    getAdminUser: vi.fn().mockResolvedValue({ id: 'admin-id' }),
    getDeletedUser: vi.fn().mockResolvedValue({ id: 'deleted-id' })
  }
})

const followMock = vi.fn().mockResolvedValue(true)
vi.mock('../services/follow.js', () => {
  return { follow: followMock }
})

const sendEmailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../utils/sendEmail.js', () => {
  return { default: sendEmailMock }
})

const optimizeMediaMock = vi.fn().mockResolvedValue('uploads/fake.webp')
vi.mock('../utils/optimizeMedia.js', () => {
  return { default: optimizeMediaMock }
})

const redisDelMock = vi.fn().mockResolvedValue(1)
vi.mock('../utils/redis.js', () => {
  return {
    redisCache: { del: redisDelMock },
    redisBloom: { add: vi.fn(), exists: vi.fn(), reserve: vi.fn() }
  }
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

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userScopeFindOneMock.mockResolvedValue(null)
    userCreateMock.mockImplementation(async (attrs: Record<string, unknown>) => ({ id: attrs.id, ...attrs }))
  })

  it('creates a new account from a well-formed multipart registration request', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/register')
      .field('email', 'gabriel.amador.garcia@testmail.com')
      .field('password', 'testPassword123')
      .field('url', 'testuser')
      .field('description', 'I am a test user')
      .field('birthDate', 'Fri Aug 01 2008 00:00:00 GMT+0200 (hora de verano de Europa central)')
      .field('captchaResponse', '')
      .field('avatar', '')
      .field('confirmReadAbout', 'true')
      .field('blueskyOption', '1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })

    expect(userScopeFindOneMock).toHaveBeenCalledTimes(1)
    expect(userCreateMock).toHaveBeenCalledTimes(1)

    const createdUser = userCreateMock.mock.calls[0][0]
    expect(createdUser.email).toBe('gabriel.amador.garcia@testmail.com')
    expect(createdUser.url).toBe('testuser')
    expect(createdUser.description).toBe('I am a test user')
    expect(createdUser.activated).toBe(false)
    expect(createdUser.password).not.toBe('testPassword123')

    expect(followMock).toHaveBeenCalledWith(createdUser.id, 'admin-id')
    expect(queueAddMock).toHaveBeenCalledWith('generateUserKeyPair', { userId: createdUser.id })
    expect(redisDelMock).toHaveBeenCalledWith('allLocalUserIds')
    expect(userOptionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: createdUser.id, optionValue: '1' })
    )
  })

  it('rejects registration when the account is under the minimum age', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/register')
      .field('email', 'toonewuser@testmail.com')
      .field('password', 'testPassword123')
      .field('url', 'toonewuser')
      .field('description', 'too young')
      .field('birthDate', new Date().toISOString())
      .field('confirmReadAbout', 'true')
      .field('blueskyOption', '1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ success: false, error: true, message: 'Invalid age' })
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('does not leak whether an email/url is already registered', async () => {
    userScopeFindOneMock.mockResolvedValue({ id: 'existing-user' })
    const app = buildApp()

    const response = await request(app)
      .post('/api/register')
      .field('email', 'gabriel.amador.garcia@testmail.com')
      .field('password', 'testPassword123')
      .field('url', 'testuser')
      .field('description', 'I am a test user')
      .field('birthDate', 'Fri Aug 01 2008 00:00:00 GMT+0200 (hora de verano de Europa central)')
      .field('confirmReadAbout', 'true')
      .field('blueskyOption', '1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })
    expect(userCreateMock).not.toHaveBeenCalled()
  })
})
