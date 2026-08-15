export interface BskyFeed {
  uri: string
  displayName: string
  description?: string
  avatar?: string
  creatorHandle: string
  likeCount?: number
}

export interface MyBskyFeed extends BskyFeed {
  pinned: boolean
}
