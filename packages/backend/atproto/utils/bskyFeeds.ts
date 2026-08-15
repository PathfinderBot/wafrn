import { AppBskyFeedDefs, AppBskyFeedGenerator } from '@atproto/api'
import { User } from '../../models/index.js'
import { logger } from '../../utils/logger.js'
import { getAdminAtprotoSession } from './getAdminAtprotoSession.js'
import { getAtProtoSession } from './getAtProtoSession.js'
import { getAtprotoRecordDirect } from './getAtProtoThread.js'

interface FeedInfo {
  uri: string
  displayName: string
  description?: string
  avatar?: string
  creatorHandle: string
  likeCount?: number
}

interface MyFeed extends FeedInfo {
  pinned: boolean
}

function toFeedInfo(feed: AppBskyFeedDefs.GeneratorView): FeedInfo {
  return {
    uri: feed.uri,
    displayName: feed.displayName,
    description: feed.description,
    avatar: feed.avatar,
    creatorHandle: feed.creator.handle,
    likeCount: feed.likeCount
  }
}

async function getFeedInfo(feedUri: string): Promise<Pick<FeedInfo, 'uri' | 'displayName' | 'description'> | undefined> {
  try {
    const record = await getAtprotoRecordDirect(feedUri)
    const value = record?.value as AppBskyFeedGenerator.Record | undefined
    if (!value?.displayName) {
      return undefined
    }
    return {
      uri: feedUri,
      displayName: value.displayName,
      description: value.description
    }
  } catch (error) {
    logger.debug({
      message: `Error obtaining bsky feed info for ${feedUri}`,
      error: error
    })
    return undefined
  }
}

async function getFeedAvatarUrl(feedUri: string): Promise<string | undefined> {
  try {
    const session = await getAdminAtprotoSession()
    const result = await session.app.bsky.feed.getFeedGenerator({ feed: feedUri })
    return result.data.view.avatar
  } catch (error) {
    logger.debug({
      message: `Error obtaining bsky feed avatar for ${feedUri}`,
      error: error
    })
    return undefined
  }
}

async function searchFeeds(user: User, query: string, limit = 25): Promise<FeedInfo[]> {
  try {
    const session = await getAtProtoSession(user)
    const result = await session.app.bsky.unspecced.getPopularFeedGenerators({ query, limit })
    return result.data.feeds.map(toFeedInfo)
  } catch (error) {
    logger.debug({
      message: `Error searching bsky feeds for query "${query}"`,
      user: user.url,
      error: error
    })
    return []
  }
}

async function getMyFeeds(user: User): Promise<MyFeed[]> {
  try {
    const session = await getAtProtoSession(user)
    const prefs = await session.getPreferences()
    const savedFeeds = prefs.savedFeeds.filter((feed) => feed.type === 'feed')
    if (savedFeeds.length === 0) {
      return []
    }
    const result = await session.app.bsky.feed.getFeedGenerators({
      feeds: savedFeeds.map((feed) => feed.value)
    })
    const feedsByUri = new Map(result.data.feeds.map((feed) => [feed.uri, feed]))
    return savedFeeds
      .map((saved) => {
        const feed = feedsByUri.get(saved.value)
        return feed ? { ...toFeedInfo(feed), pinned: saved.pinned } : undefined
      })
      .filter((feed): feed is MyFeed => !!feed)
  } catch (error) {
    logger.debug({
      message: `Error obtaining bsky feed subscriptions for user ${user.url}`,
      error: error
    })
    return []
  }
}

async function followFeed(user: User, feedUri: string): Promise<boolean> {
  try {
    const session = await getAtProtoSession(user)
    const prefs = await session.getPreferences()
    const existing = prefs.savedFeeds.find((feed) => feed.type === 'feed' && feed.value === feedUri)
    if (existing) {
      if (!existing.pinned) {
        await session.updateSavedFeeds([{ ...existing, pinned: true }])
      }
    } else {
      await session.addSavedFeeds([{ type: 'feed', value: feedUri, pinned: true }])
    }
    return true
  } catch (error) {
    logger.debug({
      message: `Error following bsky feed ${feedUri} for user ${user.url}`,
      user: user.url,
      error: error
    })
    return false
  }
}

async function unpinFeed(user: User, feedUri: string): Promise<boolean> {
  try {
    const session = await getAtProtoSession(user)
    const prefs = await session.getPreferences()
    const existing = prefs.savedFeeds.find((feed) => feed.type === 'feed' && feed.value === feedUri)
    if (existing?.pinned) {
      await session.updateSavedFeeds([{ ...existing, pinned: false }])
    }
    return true
  } catch (error) {
    logger.debug({
      message: `Error unpinning bsky feed ${feedUri} for user ${user.url}`,
      user: user.url,
      error: error
    })
    return false
  }
}

async function unfollowFeed(user: User, feedUri: string): Promise<boolean> {
  try {
    const session = await getAtProtoSession(user)
    const prefs = await session.getPreferences()
    const existing = prefs.savedFeeds.find((feed) => feed.type === 'feed' && feed.value === feedUri)
    if (existing) {
      await session.removeSavedFeeds([existing.id])
    }
    return true
  } catch (error) {
    logger.debug({
      message: `Error unfollowing bsky feed ${feedUri} for user ${user.url}`,
      user: user.url,
      error: error
    })
    return false
  }
}

export { getFeedInfo, getFeedAvatarUrl, searchFeeds, getMyFeeds, followFeed, unpinFeed, unfollowFeed }
export type { FeedInfo, MyFeed }
