import { vi } from 'vitest'
// Test-only helpers


export function buildPost(overrides: Record<string, unknown> = {}) {
  const { tags, ask, ...rest } = overrides
  return {
    id: 'post-1',
    content: '<p>hello world</p>',
    markdownContent: undefined,
    content_warning: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    language: undefined,
    parentId: undefined,
    rootId: undefined,
    getPostTags: vi.fn().mockResolvedValue(tags ?? []),
    getAsk: vi.fn().mockResolvedValue(ask ?? null),
    ...rest
  }
}

export function buildMedia(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1',
    mediaOrder: 0,
    NSFW: false,
    description: 'a description',
    url: 'media-1.jpg',
    mediaType: 'image/jpeg',
    width: 800,
    height: 600,
    ...overrides
  }
}

