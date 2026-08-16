import request from 'supertest'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Blocks, Follows, User, sequelize } from '../models/index.js'
import { buildTestApp, createTestFollow, createTestUser, createTestTokenForUser } from '../utils/testHelpers.js'
import blockRoutes from './blocks.js'

const app = buildTestApp(blockRoutes)

let userIdsToCleanup: string[] = []

afterEach(async () => {
  const ids = userIdsToCleanup
  userIdsToCleanup = []
  await Blocks.destroy({ where: { blockerId: ids } })
  await Blocks.destroy({ where: { blockedId: ids } })
  await Follows.destroy({ where: { followerId: ids } })
  await Follows.destroy({ where: { followedId: ids } })
  await User.destroy({ where: { id: ids } })
})

afterAll(async () => {
  await sequelize.close()
})

describe('POST /api/block', () => {
  it('blocks another user and tears down any mutual follow, matching the frontend { userId, reason } payload', async () => {
    const blocker = await createTestUser()
    const target = await createTestUser()
    userIdsToCleanup.push(blocker.id, target.id)
    const token = createTestTokenForUser(blocker)

    await createTestFollow(blocker.id, target.id)
    await createTestFollow(target.id, blocker.id)

    const response = await request(app)
      .post('/api/block')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, reason: 'spam' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true })

    const block = await Blocks.findOne({ where: { blockerId: blocker.id, blockedId: target.id } })
    expect(block).not.toBeNull()
    expect(block!.reason).toBe('spam')

    const remainingFollows = await Follows.findAll({
      where: { followerId: [blocker.id, target.id], followedId: [blocker.id, target.id] }
    })
    expect(remainingFollows).toHaveLength(0)
  })

  it('refuses to block yourself', async () => {
    const blocker = await createTestUser()
    userIdsToCleanup.push(blocker.id)
    const token = createTestTokenForUser(blocker)

    const response = await request(app)
      .post('/api/block')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: blocker.id })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: false })

    const block = await Blocks.findOne({ where: { blockerId: blocker.id, blockedId: blocker.id } })
    expect(block).toBeNull()
  })

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).post('/api/block').send({ userId: '00000000-0000-0000-0000-000000000000' })
    expect(response.status).toBe(401)
  })
})

describe('GET /api/myBlocks and POST /api/unblock-user', () => {
  it('lists blocked users and removes them via unblock-user', async () => {
    const blocker = await createTestUser()
    const target = await createTestUser()
    userIdsToCleanup.push(blocker.id, target.id)
    const token = createTestTokenForUser(blocker)

    await request(app).post('/api/block').set('Authorization', `Bearer ${token}`).send({ userId: target.id })

    const listResponse = await request(app).get('/api/myBlocks').set('Authorization', `Bearer ${token}`)
    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toHaveLength(1)
    expect(listResponse.body[0].blocked.id).toBe(target.id)

    const unblockResponse = await request(app)
      .post('/api/unblock-user')
      .query({ id: target.id })
      .set('Authorization', `Bearer ${token}`)
    expect(unblockResponse.status).toBe(200)
    expect(unblockResponse.body).toEqual([])

    const remaining = await Blocks.findOne({ where: { blockerId: blocker.id, blockedId: target.id } })
    expect(remaining).toBeNull()
  })
})
