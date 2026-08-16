import express, { Application } from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { Blocks, Notification, PushNotificationToken, UnifiedPushData, User, sequelize } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'

const { sendNotificationMock, expoSendMock, expoChunkMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn().mockResolvedValue(undefined),
  expoSendMock: vi.fn().mockResolvedValue([]),
  expoChunkMock: vi.fn((payloads: unknown[]) => [payloads])
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: sendNotificationMock
  }
}))

vi.mock('expo-server-sdk', () => ({
  Expo: class {
    chunkPushNotifications = expoChunkMock
    sendPushNotificationsAsync = expoSendMock
  }
}))

const { notificationRoutes } = await import('./notifications.js')
const { sendPushNotification } = await import('../queueProcessors/sendPushNotification.js')

function buildApp(): Application {
  const app = express()
  notificationRoutes(app)
  return app
}

async function createUser(overrides: Partial<{ banned: boolean }> = {}): Promise<User> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  return User.create({
    url: `notiftest${suffix}`,
    email: `notiftest-${suffix}@testmail.com`,
    activated: true,
    banned: overrides.banned ?? false
  })
}

function tokenFor(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      url: user.url,
      role: user.role
    },
    completeEnvironment.jwtSecret,
    { expiresIn: '300s' }
  )
}

async function createFollowNotification(originUserId: string, notifiedUserId: string) {
  return Notification.create({
    notificationType: 'FOLLOW',
    userId: originUserId,
    notifiedUserId,
    detached: false
  })
}

let createdUserIds: string[] = []

afterEach(async () => {
  const ids = createdUserIds
  createdUserIds = []
  await Notification.destroy({ where: { notifiedUserId: ids } })
  await Notification.destroy({ where: { userId: ids } })
  await Blocks.destroy({ where: { blockerId: ids } })
  await Blocks.destroy({ where: { blockedId: ids } })
  await PushNotificationToken.destroy({ where: { userId: ids } })
  await UnifiedPushData.destroy({ where: { userId: ids } })
  await User.destroy({ where: { id: ids } })
})

afterAll(async () => {
  await sequelize.close()
})

describe('GET /api/v3/notificationsScroll and /api/v2/notificationsCount blocking/banning rules', () => {
  it('does not show or count a notification whose origin user the notified user has blocked', async () => {
    const notifiedUser = await createUser()
    const blockedOriginUser = await createUser()
    const friendlyOriginUser = await createUser()
    createdUserIds.push(notifiedUser.id, blockedOriginUser.id, friendlyOriginUser.id)

    await Blocks.create({ blockerId: notifiedUser.id, blockedId: blockedOriginUser.id })
    await createFollowNotification(blockedOriginUser.id, notifiedUser.id)
    await createFollowNotification(friendlyOriginUser.id, notifiedUser.id)

    const app = buildApp()
    const token = tokenFor(notifiedUser)

    const scrollResponse = await request(app).get('/api/v3/notificationsScroll').set('Authorization', `Bearer ${token}`)

    expect(scrollResponse.status).toBe(200)
    const notificationOriginUserIds = scrollResponse.body.notifications.map((n: any) => n.userId)
    expect(notificationOriginUserIds).not.toContain(blockedOriginUser.id)
    expect(notificationOriginUserIds).toContain(friendlyOriginUser.id)

    const countResponse = await request(app).get('/api/v2/notificationsCount').set('Authorization', `Bearer ${token}`)

    expect(countResponse.status).toBe(200)
    expect(countResponse.body.notifications).toBe(1)
  })

  it('does not show or count a notification whose origin user has blocked the notified user', async () => {
    const notifiedUser = await createUser()
    const blockingOriginUser = await createUser()
    const friendlyOriginUser = await createUser()
    createdUserIds.push(notifiedUser.id, blockingOriginUser.id, friendlyOriginUser.id)

    await Blocks.create({ blockerId: blockingOriginUser.id, blockedId: notifiedUser.id })
    await createFollowNotification(blockingOriginUser.id, notifiedUser.id)
    await createFollowNotification(friendlyOriginUser.id, notifiedUser.id)

    const app = buildApp()
    const token = tokenFor(notifiedUser)

    const scrollResponse = await request(app).get('/api/v3/notificationsScroll').set('Authorization', `Bearer ${token}`)

    expect(scrollResponse.status).toBe(200)
    const notificationOriginUserIds = scrollResponse.body.notifications.map((n: any) => n.userId)
    expect(notificationOriginUserIds).not.toContain(blockingOriginUser.id)
    expect(notificationOriginUserIds).toContain(friendlyOriginUser.id)

    const countResponse = await request(app).get('/api/v2/notificationsCount').set('Authorization', `Bearer ${token}`)

    expect(countResponse.status).toBe(200)
    expect(countResponse.body.notifications).toBe(1)
  })

  it('does not show or count a notification whose origin user is banned', async () => {
    const notifiedUser = await createUser()
    const bannedOriginUser = await createUser({ banned: true })
    const friendlyOriginUser = await createUser()
    createdUserIds.push(notifiedUser.id, bannedOriginUser.id, friendlyOriginUser.id)

    await createFollowNotification(bannedOriginUser.id, notifiedUser.id)
    await createFollowNotification(friendlyOriginUser.id, notifiedUser.id)

    const app = buildApp()
    const token = tokenFor(notifiedUser)

    const scrollResponse = await request(app).get('/api/v3/notificationsScroll').set('Authorization', `Bearer ${token}`)

    expect(scrollResponse.status).toBe(200)
    const notificationOriginUserIds = scrollResponse.body.notifications.map((n: any) => n.userId)
    expect(notificationOriginUserIds).not.toContain(bannedOriginUser.id)
    expect(notificationOriginUserIds).toContain(friendlyOriginUser.id)

    const countResponse = await request(app).get('/api/v2/notificationsCount').set('Authorization', `Bearer ${token}`)

    expect(countResponse.status).toBe(200)
    expect(countResponse.body.notifications).toBe(1)
  })
})

describe('sendPushNotification blocking/banning rules', () => {
  it('does not send a push notification (webpush or Expo) when the origin user is blocked or banned', async () => {
    const notifiedUser = await createUser()
    const blockedOriginUser = await createUser()
    const bannedOriginUser = await createUser({ banned: true })
    const friendlyOriginUser = await createUser()
    createdUserIds.push(notifiedUser.id, blockedOriginUser.id, bannedOriginUser.id, friendlyOriginUser.id)

    await Blocks.create({ blockerId: notifiedUser.id, blockedId: blockedOriginUser.id })

    await PushNotificationToken.create({
      token: `ExponentPushToken[test-${randomUUID()}]`,
      userId: notifiedUser.id
    })
    await UnifiedPushData.create({
      userId: notifiedUser.id,
      endpoint: 'https://push.example.test/endpoint',
      deviceAuth: 'auth',
      devicePublicKey: 'key'
    })

    sendNotificationMock.mockClear()
    expoSendMock.mockClear()
    expoChunkMock.mockClear()

    await sendPushNotification({
      data: {
        notifications: [
          {
            userId: blockedOriginUser.id,
            notifiedUserId: notifiedUser.id,
            notificationType: 'FOLLOW',
            detached: false
          },
          {
            userId: bannedOriginUser.id,
            notifiedUserId: notifiedUser.id,
            notificationType: 'FOLLOW',
            detached: false
          },
          {
            userId: friendlyOriginUser.id,
            notifiedUserId: notifiedUser.id,
            notificationType: 'FOLLOW',
            detached: false
          }
        ]
      }
    } as any)

    // webpush: only the notification from the friendly (non-blocked, non-banned) origin user should be sent
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)

    // Expo push: same expectation, only the friendly origin user's notification should reach Expo
    expect(expoSendMock).toHaveBeenCalledTimes(1)
    const sentPayloads = expoSendMock.mock.calls[0][0] as { data: { notification: { userId: string } } }[]
    const sentOriginUserIds = sentPayloads.map((p) => p.data.notification.userId)
    expect(sentOriginUserIds).toEqual([friendlyOriginUser.id])
    expect(sentOriginUserIds).not.toContain(blockedOriginUser.id)
    expect(sentOriginUserIds).not.toContain(bannedOriginUser.id)
  })
})
