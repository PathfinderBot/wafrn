import { getAtProtoSession } from './getAtProtoSession.js'
import { Post } from '../../models/post.js'
import { User } from '../../models/user.js'

export default async function sendBiteBsky(biterId: string, postId?: string, userId?: string) {
  const post = postId ? await Post.findByPk(postId) : undefined
  const user = userId ? await User.findByPk(userId) : undefined
  const localUser = await User.findByPk(biterId)

  if ((post && !post?.bskyUri) || (user && !user.bskyDid)) return // make sure there is actually a bsky user
  if (!localUser || !localUser.enableBsky || !localUser.bskyDid) return // make sure there's actually a bsky account to put the record on

  const subjectUri = post ? post.bskyUri : user ? 'at://' + user.bskyDid : ''

  const bskyBite = {
    $type: 'net.wafrn.feed.bite',
    subject: subjectUri,
    createdAt: new Date(Date.now()).toISOString()
  }

  let agent = await getAtProtoSession(localUser)

  await agent.com.atproto.repo.createRecord({
    repo: agent.session?.did ?? localUser.bskyDid ?? '',
    collection: 'net.wafrn.feed.bite',
    record: bskyBite
  })
}
