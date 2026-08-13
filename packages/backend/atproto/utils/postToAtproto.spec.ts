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
    defaultSEOData: { title: 'wafrn' },
    databaseConnectionString: 'postgresql://root:root@localhost:5432/wafrn'
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

  it('sends the post tags in the native bsky `tags` field, in addition to the fedi-only fullTags', async () => {
    const post = buildPost({
      content: '<p>Witchsky has tags now</p>',
      tags: [{ tagName: 'WitchskyApp' }, { tagName: 'new features' }, { tagName: 'hype!' }]
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    const value = fetched.data.value as Record<string, unknown>
    expect(value.tags).toEqual(['WitchskyApp', 'new features', 'hype!'])
    expect(value.fullTags).toBe('WitchskyApp\nnew features\nhype!')
  })

  it('omits the `tags` field entirely when the post has no tags', async () => {
    const post = buildPost({ content: '<p>no tags here</p>' })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)

    const fetched = await agent.com.atproto.repo.getRecord({
      repo: agent.session!.did,
      collection: 'app.bsky.feed.post',
      rkey: written.uri.split('/').pop()!
    })
    expect((fetched.data.value as Record<string, unknown>).tags).toBeUndefined()
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

describe('postToAtproto against real posts reported as failing to reach Bluesky', () => {
  it('plain text reply mentioning a bridged bsky user that resolved via bsky handle (SUCCEEDED in prod)', async () => {
    // https://app.wafrn.net/fediverse/post/2bbf040a-6649-44ac-a74e-0481399a8afd
    mentionsFindAllMock.mockResolvedValue([{ userId: 'fa0116bc-f177-4615-b3e3-aee8d0548cc6' }])
    userFindByPkMock.mockResolvedValue({
      url: '@cervine.online',
      bskyDid: 'did:plc:dkfi6nrlyylndvc6hycb4iyz',
      remoteMentionUrl: null,
      enableBsky: false,
      isBlueskyUser: true
    })

    const post = buildPost({
      content: '<p>oh wait new accounts nvm</p>',
      markdownContent: 'oh wait new accounts nvm',
      parentId: '4d26726f-bf6b-4717-b4d1-5d1705d4e78d',
      rootId: '5434a6a9-6c1c-4cdf-a8d0-29d09ed68d2d'
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })

  it('plain text reply mentioning a bridged bsky user (SUCCEEDED in prod)', async () => {
    // https://app.wafrn.net/fediverse/post/decedbf5-03b9-4dc3-89ce-367e6eccec47
    mentionsFindAllMock.mockResolvedValue([{ userId: '21e2585b-19a5-4ec4-bb72-c2ecee1f98f0' }])
    userFindByPkMock.mockResolvedValue({
      url: '@ioletsgo.gay',
      bskyDid: 'did:plc:yv3gwyazmfhzok6meufpcbby',
      remoteMentionUrl: null,
      enableBsky: false,
      isBlueskyUser: true
    })

    const post = buildPost({
      content: '<p>this guy fucking sucks at mario</p>',
      markdownContent: 'this guy fucking sucks at mario',
      parentId: 'af8fe97a-1bdd-4d60-9810-8e5f75c05b1a',
      rootId: 'af8fe97a-1bdd-4d60-9810-8e5f75c05b1a'
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })

  it('plain text top-level post with a pipe and quotes in it (SUCCEEDED in prod)', async () => {
    // https://app.wafrn.net/fediverse/post/577f6921-cc37-4bae-b109-a76f54245e2a
    const post = buildPost({
      content:
        '<p>i never liked \'coding\' as a verb or \'coder\' as a noun<br />\n' +
        'i generally prefer to say "I\'m writing a (program|script)" or "I\'m programming" instead</p>',
      markdownContent:
        "i never liked 'coding' as a verb or 'coder' as a noun\n" +
        'i generally prefer to say "I\'m writing a (program|script)" or "I\'m programming" instead'
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })

  it('plain text top-level post, no mentions/media/tags (SUCCEEDED in prod)', async () => {
    // https://app.wafrn.net/fediverse/post/88c5c2e8-189c-4769-b5c3-b8661e2aee4d
    const post = buildPost({
      content: "<p>all this coughing's got me dizzy, someone should draw me disoriented and spiral-eyed</p>",
      markdownContent: "all this coughing's got me dizzy, someone should draw me disoriented and spiral-eyed"
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })

  it('plain text reply mentioning a bridged bsky user, deeper reply chain (FAILED in prod - never got a bskyUri)', async () => {
    // https://app.wafrn.net/fediverse/post/d7352c3d-55aa-467c-8511-8bd132e43ed2
    mentionsFindAllMock.mockResolvedValue([{ userId: '8448200f-effe-4b29-8707-44ee3161c922' }])
    userFindByPkMock.mockResolvedValue({
      url: '@axoga.to',
      bskyDid: 'did:plc:loise3eov323mj7pgmc5dj5z',
      remoteMentionUrl: null,
      enableBsky: false,
      isBlueskyUser: true
    })

    const post = buildPost({
      content: '<p>posting about the platform in which the posting in taking place on</p>',
      markdownContent: 'posting about the platform in which the posting in taking place on',
      parentId: '563b8b82-228c-4042-8f73-c03cef17e9c2',
      rootId: '0431f13f-9210-45a5-a6a2-db2e6ce9591e'
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })

  it('plain text top-level post mentioning "bsky" as a word, no actual mentions (FAILED in prod - never got a bskyUri)', async () => {
    // https://app.wafrn.net/fediverse/post/529f54c0-e4c5-42f1-b48d-080cbac52446
    const post = buildPost({
      content:
        "<p>unpleasant twitterbrained types are starting to crop up more and more on bsky and i'm afraid i have much less patience for that now</p>",
      markdownContent:
        "unpleasant twitterbrained types are starting to crop up more and more on bsky and i'm afraid i have much less patience for that now"
    })

    const record = await postToAtproto(post as unknown as Post, agent as unknown as BskyAgent)
    const written = await agent.post(record)
    expect(written.uri).toMatch(/^at:\/\//)
  })
})
