import express, { Application } from 'express'
import bodyParser from 'body-parser'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { Follows, Post, User } from '../models/index.js'
import { FollowsAttributes } from '../models/follows.js'
import { PostAttributes } from '../models/post.js'
import { UserAttributes } from '../models/user.js'
import { completeEnvironment } from './backendOptions.js'
import { redisCache } from './redis.js'

// To test the backend we crete a fake app and we mock some calls
export function buildTestApp(...mounters: Array<(app: Application) => void>): Application {
  const app = express()
  app.use(bodyParser.json())
  for (const mount of mounters) {
    mount(app)
  }
  return app
}

// creates a test user, takes care of cache
export async function createTestUser(overrides: Partial<UserAttributes> = {}): Promise<User> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  const user = await User.create({
    url: overrides.url ?? `testuser${suffix}`,
    email: overrides.email ?? `testuser-${suffix}@testmail.com`,
    activated: overrides.activated ?? true,
    banned: overrides.banned ?? false,
    ...overrides
  })
  await redisCache.del('allLocalUserIds')
  return user
}


// Creates a test post owned by an user
export async function createTestPost(userId: string, overrides: Partial<PostAttributes> = {}): Promise<Post> {
  return Post.create({
    userId,
    content: overrides.content ?? '<p>a test post</p>',
    privacy: overrides.privacy ?? 0,
    ...overrides
  })
}

// Creates a test follow
export async function createTestFollow(
  followerId: string,
  followedId: string,
  overrides: Partial<FollowsAttributes> = {}
): Promise<Follows> {
  return Follows.create({
    followerId,
    followedId,
    accepted: overrides.accepted ?? true,
    muteRewoots: false,
    muteQuotes: false,
    hideReplies: false,
    ...overrides
  })
}

// Creates a jwt token for a test user. 5 minutes, a lot less than whats gona be needed
export function createTestTokenForUser(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      birthDate: user.birthDate,
      url: user.url,
      role: user.role
    },
    completeEnvironment.jwtSecret,
    { expiresIn: '300s' }
  )
}
