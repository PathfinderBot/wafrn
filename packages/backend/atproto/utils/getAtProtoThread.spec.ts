import { describe, it, expect } from 'vitest'
import type { AppBskyFeedPost } from '@atproto/api'
import { mergePostTags } from './getAtProtoThread.js'

// real example of a bsky post that uses `tags`, an array of hashtags that lives
// outside of the post body/facets (as opposed to hashtags typed inside the post text)
const postWithOutOfBodyTags = {
  uri: 'at://did:plc:q7suwaz53ztc4mbiqyygbn43/app.bsky.feed.post/3msrrbuwubc25',
  cid: 'bafyreie7zlewzjkxaracny2lc5oapkjn2eq7tbujh3z5gs33tmshcod5fm',
  value: {
    via: 'Witchsky Web App',
    tags: ['WitchskyApp', 'new features', 'hype!'],
    text: 'Witchsky has tags & the ability to move skeets around in the composer now',
    $type: 'app.bsky.feed.post',
    langs: ['en'],
    createdAt: '2026-08-11T04:21:56.642Z'
  }
} as const

describe('mergePostTags', () => {
  it('picks up tags declared outside of the post body (post.tags)', () => {
    const post = postWithOutOfBodyTags.value as unknown as AppBskyFeedPost.Main
    const result = mergePostTags([], post.tags)

    expect(result).toEqual(['WitchskyApp', 'new features', 'hype!'])
  })

  it('combines hashtags found in the body with tags declared outside of it', () => {
    const bodyTags = ['justiceforskibiditoilet']
    const result = mergePostTags(bodyTags, [...postWithOutOfBodyTags.value.tags])

    expect(result).toEqual(['justiceforskibiditoilet', 'WitchskyApp', 'new features', 'hype!'])
  })

  it('deduplicates tags that appear both in the body and in post.tags', () => {
    const bodyTags = ['WitchskyApp']
    const result = mergePostTags(bodyTags, [...postWithOutOfBodyTags.value.tags])

    expect(result).toEqual(['WitchskyApp', 'new features', 'hype!'])
  })

  it('returns the body tags unchanged when the post has no tags field', () => {
    const bodyTags = ['someTag']
    expect(mergePostTags(bodyTags, undefined)).toEqual(bodyTags)
  })

  it('returns an empty array when neither source has tags', () => {
    expect(mergePostTags([], undefined)).toEqual([])
  })
})
