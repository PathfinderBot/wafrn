import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { Job } from 'bullmq'
import { Post, User, sequelize } from '../models/index.js'
import { Privacy, InteractionControl } from '../models/post.js'

vi.mock('../utils/backendOptions.js', async (importOriginal) => {
  const actual = (await importOriginal()) as { completeEnvironment: Record<string, unknown> }
  return { completeEnvironment: { ...actual.completeEnvironment, enableBsky: true } }
})

const getAtProtoSessionMock = vi.fn()
vi.mock('../atproto/utils/getAtProtoSession.js', () => ({
  getAtProtoSession: getAtProtoSessionMock
}))

const postToAtprotoMock = vi.fn()
vi.mock('../atproto/utils/postToAtproto.js', () => ({
  postToAtproto: postToAtprotoMock
}))

vi.mock('../utils/wait.js', () => ({
  wait: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn() }
}))

vi.mock('../utils/redis.js', () => ({
  redisBloom: { add: vi.fn().mockResolvedValue(undefined) },
  redisCache: { del: vi.fn().mockResolvedValue(undefined) }
}))

const queueAddMock = vi.fn()
vi.mock('../utils/queues.js', () => ({
  getQueue: vi.fn(() => ({ add: queueAddMock }))
}))

const { sendPostBsky } = await import('./sendPostBsky.js')

async function createUser(overrides: Partial<{ enableBsky: boolean; bskyDid: string | null }> = {}): Promise<User> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  return User.create({
    url: `sendbskytest${suffix}`,
    email: `sendbskytest-${suffix}@testmail.com`,
    activated: true,
    enableBsky: overrides.enableBsky ?? true,
    bskyDid: overrides.bskyDid === undefined ? `did:plc:test${suffix}` : overrides.bskyDid
  })
}

async function createPost(user: User, overrides: Record<string, unknown> = {}): Promise<Post> {
  return Post.create({
    userId: user.id,
    privacy: Privacy.Public,
    content: 'hello',
    content_warning: '',
    hierarchyLevel: 2,
    replyControl: InteractionControl.Anyone,
    quoteControl: InteractionControl.Anyone,
    ...overrides
  })
}

function buildJob(postId: string, attemptsMade = 0): Job {
  return { data: { postId }, attemptsMade } as unknown as Job
}

let createdPostIds: string[] = []
let createdUserIds: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  getAtProtoSessionMock.mockResolvedValue({
    session: { did: 'did:plc:localuser' },
    com: { atproto: { repo: { createRecord: vi.fn().mockResolvedValue(undefined) } } }
  })
})

afterEach(async () => {
  // replies reference their parent's id, so tear down in reverse creation order
  const postIds = createdPostIds
  createdPostIds = []
  for (const id of postIds.reverse()) {
    await Post.destroy({ where: { id } })
  }
  const userIds = createdUserIds
  createdUserIds = []
  await User.destroy({ where: { id: userIds } })
})

afterAll(async () => {
  await sequelize.close()
})

describe('sendPostBsky', () => {
  it('rethrows so bullmq retries, but still queues the fedi crosspost, when postToAtproto/agent.post fails on the first attempt', async () => {
    const user = await createUser()
    const post = await createPost(user)
    createdUserIds.push(user.id)
    createdPostIds.push(post.id)

    postToAtprotoMock.mockResolvedValue({ text: 'hello' })
    getAtProtoSessionMock.mockResolvedValue({
      post: vi.fn().mockRejectedValue(new Error('PDS is down')),
      session: { did: 'did:plc:localuser' },
      com: { atproto: { repo: { createRecord: vi.fn() } } }
    })

    await expect(sendPostBsky(buildJob(post.id, 0))).rejects.toThrow('PDS is down')

    const reloaded = await Post.findByPk(post.id)
    expect(reloaded!.bskyUri).toBeNull()
    expect(queueAddMock).toHaveBeenCalledTimes(1)
    expect(queueAddMock).toHaveBeenCalledWith('prepareSendPost', { postId: post.id }, { delay: 2500 })
  })

  it('does not queue a second fedi crosspost when bullmq retries the job', async () => {
    const user = await createUser()
    const post = await createPost(user)
    createdUserIds.push(user.id)
    createdPostIds.push(post.id)

    postToAtprotoMock.mockResolvedValue({ text: 'hello' })
    getAtProtoSessionMock.mockResolvedValue({
      post: vi.fn().mockRejectedValue(new Error('still down')),
      session: { did: 'did:plc:localuser' },
      com: { atproto: { repo: { createRecord: vi.fn() } } }
    })

    // attemptsMade: 1 == bullmq's second attempt, after the first attempt already queued fedi delivery
    await expect(sendPostBsky(buildJob(post.id, 1))).rejects.toThrow('still down')

    expect(queueAddMock).not.toHaveBeenCalled()
  })

  it('throws instead of silently skipping when a reply is queued before its parent has a bskyUri, and still queues the fedi crosspost', async () => {
    const user = await createUser()
    const parent = await createPost(user, { hierarchyLevel: 1, bskyUri: null })
    const reply = await createPost(user, { parentId: parent.id, rootId: parent.id })
    createdUserIds.push(user.id)
    createdPostIds.push(parent.id, reply.id)

    await expect(sendPostBsky(buildJob(reply.id, 0))).rejects.toThrow(new RegExp(parent.id))

    expect(postToAtprotoMock).not.toHaveBeenCalled()
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('posts normally as a reply once the parent already has a bskyUri', async () => {
    const user = await createUser()
    const parent = await createPost(user, {
      hierarchyLevel: 1,
      bskyUri: 'at://did:plc:parent/app.bsky.feed.post/abc',
      bskyCid: 'cid-parent'
    })
    const reply = await createPost(user, { parentId: parent.id, rootId: parent.id })
    createdUserIds.push(user.id)
    createdPostIds.push(parent.id, reply.id)

    postToAtprotoMock.mockResolvedValue({ text: 'hello', reply: { root: { uri: 'x', cid: 'y' } } })
    getAtProtoSessionMock.mockResolvedValue({
      post: vi.fn().mockResolvedValue({ uri: 'at://did:plc:localuser/app.bsky.feed.post/xyz', cid: 'cid-xyz' }),
      session: { did: 'did:plc:localuser' },
      com: { atproto: { repo: { createRecord: vi.fn().mockResolvedValue(undefined) } } }
    })

    await sendPostBsky(buildJob(reply.id, 0))

    const reloaded = await Post.findByPk(reply.id)
    expect(reloaded!.bskyUri).toBe('at://did:plc:localuser/app.bsky.feed.post/xyz')
    expect(reloaded!.bskyCid).toBe('cid-xyz')
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })

  it('leaves bskyUri untouched and does not attempt to post when the user has bsky disabled', async () => {
    const user = await createUser({ enableBsky: false })
    const post = await createPost(user)
    createdUserIds.push(user.id)
    createdPostIds.push(post.id)

    await sendPostBsky(buildJob(post.id, 0))

    expect(postToAtprotoMock).not.toHaveBeenCalled()
    const reloaded = await Post.findByPk(post.id)
    expect(reloaded!.bskyUri).toBeNull()
    expect(queueAddMock).toHaveBeenCalledTimes(1)
  })
})
