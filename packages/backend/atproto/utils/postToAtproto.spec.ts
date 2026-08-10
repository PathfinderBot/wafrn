import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import type { BskyAgent } from '@atproto/api'
import type { Post } from '../../models/post.js'
import { buildMedia, buildPost } from './postToAtprotoFixtures.js'

// This file spins up a real, local, in-process PDS + PLC via
// @atproto/dev-env -- the same harness the atproto monorepo uses for its own integration
// This is great for us to test that a post would go to

const quotesFindOneMock = vi.fn()
const postFindByPkMock = vi.fn()
const mentionsFindAllMock = vi.fn()
const userFindByPkMock = vi.fn()
const mediaFindAllMock = vi.fn()

vi.mock('../../models/index.js', () => ({
  Media: { findAll: mediaFindAllMock },
  Post: { findByPk: postFindByPkMock },
  PostMentionsUserRelation: { findAll: mentionsFindAllMock },
  Quotes: { findOne: quotesFindOneMock },
  User: { findByPk: userFindByPkMock }
}))

vi.mock('../../utils/backendOptions.js', () => ({
  completeEnvironment: {
    instanceUrl: 'instance.test',
    frontendUrl: 'https://instance.test',
    mediaUrl: 'https://instance.test/api/uploads',
    adminEmail: 'admin@instance.test',
    defaultSEOData: { title: 'wafrn' }
  }
}))

vi.mock('../../utils/cacheGetters/getPostAndUserFromPostId.js', () => ({
  getPostAndUserFromPostId: vi.fn().mockResolvedValue({ found: true, data: {} })
}))

vi.mock('../../activitypub/postToJSONLD.js', () => ({
  getPostUrlForQuote: vi.fn().mockResolvedValue('https://bsky.app/profile/did:plc:quoted/post/abc')
}))

vi.mock('../../utils/redis.js', () => ({
  redisCache: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) }
}))

// we rather not do network calls that might fail during testing
vi.mock('link-preview-js', () => ({
  getLinkPreview: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn() }
}))

const readFileMock = vi.fn().mockResolvedValue(Buffer.alloc(1000, 1))
interface FsPromisesDefault {
  readFile: (...args: unknown[]) => Promise<unknown>
  unlink: (...args: unknown[]) => Promise<unknown>
}
vi.mock('fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as unknown as { default: FsPromisesDefault }
  const isWafrnUploadPath = (path: unknown) => typeof path === 'string' && path.startsWith('uploads/')
  return {
    ...actual,
    default: {
      ...actual.default,
      readFile: (path: string, ...rest: unknown[]) =>
        isWafrnUploadPath(path) ? readFileMock(path, ...rest) : actual.default.readFile(path, ...rest),
      unlink: (path: string, ...rest: unknown[]) =>
        isWafrnUploadPath(path) ? Promise.resolve() : actual.default.unlink(path, ...rest)
    }
  }
})

vi.mock('sharp', () => ({
  default: vi.fn((path: string) => ({
    metadata: () =>
      typeof path === 'string' && path.includes('broken')
        ? Promise.reject(new Error('unsupported image format'))
        : Promise.resolve({ width: 800, height: 600, pages: 1 })
  }))
}))

vi.mock('fluent-ffmpeg', () => {
  const ffmpegFn = Object.assign(vi.fn(), {
    ffprobe: vi.fn((_path: string, cb: (err: unknown, metadata: unknown) => void) =>
      cb(null, { streams: [{ codec_type: 'video' }], format: {} })
    )
  })
  return { default: ffmpegFn }
})

vi.mock('../../utils/optimizeMedia.js', () => ({
  default: vi.fn().mockResolvedValue(undefined),
  createThumbnail: vi.fn().mockResolvedValue(Buffer.from('thumb'))
}))

const { postToAtproto } = await import('./postToAtproto.js')

let network: TestNetworkNoAppView
// due library shenanigans, we need to use any on tests. HEY WE GOT TESTS DONT COMPLAIN
let agent: ReturnType<TestNetworkNoAppView['pds']['getAgent']>

beforeAll(async () => {
  network = await TestNetworkNoAppView.create()
  agent = network.pds.getAgent()
  await agent.createAccount({
    handle: 'alice.test',
    email: 'alice@test.com',
    password: 'alice-pass'
  })
}, 60_000)

afterAll(async () => {
  await network?.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  quotesFindOneMock.mockResolvedValue(null)
  postFindByPkMock.mockResolvedValue(null)
  mentionsFindAllMock.mockResolvedValue([])
  userFindByPkMock.mockResolvedValue(null)
  mediaFindAllMock.mockResolvedValue([])
  readFileMock.mockResolvedValue(Buffer.alloc(1000, 1))
})

describe('postToAtproto against a real local PDS', () => {
  it('actually creates a record on the PDS for a plain text post', async () => {
    const post = buildPost({ content: '<p>hello from the wafrn test suite</p>' })
    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    expect(written.uri).toMatch(/^at:\/\//)
    expect(written.cid).toBeTruthy()

    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    expect((fetched.data.value as Record<string, unknown>).text).toContain('hello from the wafrn test suite')
  })

  it('uploads media blobs and creates a post with a real images embed', async () => {
    const post = buildPost({ content: '<p>a real picture</p>' })
    mediaFindAllMock.mockResolvedValue([buildMedia({ id: 'm1' })])

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    expect(written.uri).toMatch(/^at:\/\//)
    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    expect((fetched.data.value as Record<string, { $type?: string }>).embed?.$type).toBe('app.bsky.embed.images')
  })

  // what totaly not an example post
  it('creates a post for a long, many-image submission that mentions several fedi users', async () => {
    const longPostWithManyMentions = `This is going to be a long post with many images. Click on "See complete post at…" or "Open remote link" or similar for the full experience.

This is Minka, my fursona, a pretty standard furry-ish kemonomimi (at least compared to my other characters). Co-designed by @arkenaya.eurosky.social and Shadin Art (Twitter: shadin_art), she has two refsheets because… because I could, that's the reason.

Even if it appears that way, it's not "gloves" or "boots": the white fur grows naturally on the limbs, and otherwise has a dark grey skin.

There isn't much backstory to it, this is supposed to be a "blank" persona character, an "avatar of sorts". Kind of.

Additional art by Feff @feff, Ponzu @8931ponzu (@8931ponzu.bsky.social), Rikaたそ (twitter: felicitarika), smillerbee (twitter: smillerber1).

Full Vsona profile and more art at https://vsona.vgen.co/minka`

    const post = buildPost({ content: longPostWithManyMentions })
    mediaFindAllMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => buildMedia({ id: `m${i}`, url: `m${i}.jpg`, mediaOrder: i }))
    )

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    expect(written.uri).toMatch(/^at:\/\//)
    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    // *some* embed (an external link card) rather than posting with no embed at all.
    expect((fetched.data.value as Record<string, { $type?: string }>).embed).toBeTruthy()
  })

  it('skips a single broken image instead of failing the whole post', async () => {
    const post = buildPost({ content: '<p>gallery with one bad file</p>' })
    mediaFindAllMock.mockResolvedValue([
      buildMedia({ id: 'good-1', url: 'good-1.jpg', mediaOrder: 0 }),
      buildMedia({ id: 'good-2', url: 'good-2.jpg', mediaOrder: 1 }),
      buildMedia({ id: 'broken', url: 'broken.jpg', mediaOrder: 2 }),
      buildMedia({ id: 'good-3', url: 'good-3.jpg', mediaOrder: 3 })
    ])

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    const value = fetched.data.value as Record<string, { $type?: string; images?: unknown[] }>
    expect(value.embed?.$type).toBe('app.bsky.embed.images')
    expect(value.embed?.images).toHaveLength(3)
  })
})
