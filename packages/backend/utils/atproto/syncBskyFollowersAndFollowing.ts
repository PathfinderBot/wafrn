import { Op } from 'sequelize'
import { getAtProtoSession } from '../../atproto/utils/getAtProtoSession.js'
import { forcePopulateUsers, getAtprotoUser } from '../../atproto/utils/getAtprotoUser.js'
import { Follows, User } from '../../models/index.js'
import { getAdminUser } from '../getAdminAndDeletedUser.js'
import { getAdminAtprotoSession } from './getAdminAtprotoSession.js'
import { processSinglePost } from '../../atproto/utils/getAtProtoThread.js'

async function syncBskyFollowersAndFollowing(userId: string, syncPosts?: boolean) {
  const user = await User.findByPk(userId)
  if (user && user.bskyDid) {
    const agent = await getAdminAtprotoSession()

    let followersDids: string[] = []
    let followersResponse = await agent.getFollowers({ actor: user.bskyDid })
    while (followersResponse.data.followers.length > 0) {
      followersDids = followersDids.concat(followersResponse.data.followers.map((elem) => elem.did))
      if (followersResponse.data.cursor) {
        followersResponse = await agent.getFollowers({ actor: user.bskyDid, cursor: followersResponse.data.cursor })
      } else {
        break
      }
    }
    //for await (const did of followersDids) {
    //  await getAtprotoUser(did, await getAdminUser())
    //}
    await forcePopulateUsers(followersDids, await getAdminUser())

    const followers = await User.findAll({
      where: {
        bskyDid: {
          [Op.in]: followersDids
        }
      }
    })

    for await (const follower of followers) {
      await Follows.findOrCreate({
        where: {
          followedId: userId,
          followerId: follower.id
        },
        defaults: {
          followerId: follower.id,
          followedId: userId,
          muteQuotes: false,
          muteRewoots: false,
          accepted: true
        }
      })
    }
    let followingDids: string[] = []
    let followingResponse = await agent.getFollows({ actor: user.bskyDid })
    while (followingResponse.data.follows.length > 0) {
      followingDids = followingDids.concat(followingResponse.data.follows.map((elem) => elem.did))
      if (followingResponse.data.cursor) {
        followingResponse = await agent.getFollows({ actor: user.bskyDid, cursor: followingResponse.data.cursor })
      } else {
        break
      }
    }
    //for await (const did of followingDids) {
    //  await getAtprotoUser(did, await getAdminUser())
    //}
    await forcePopulateUsers(followingDids, await getAdminUser())

    const newFollowsToCreate = await User.findAll({
      where: {
        bskyDid: {
          [Op.in]: followingDids
        }
      }
    })

    if (syncPosts) {
      let postsResponse = await agent.getAuthorFeed({ actor: user.bskyDid })
      let uris: string[] = []
      while (postsResponse.data.feed.length > 0) {
        uris = uris.concat(postsResponse.data.feed.map((elem) => elem.post.uri))
        if (postsResponse.data.cursor) {
          postsResponse = await agent.getAuthorFeed({ actor: user.bskyDid, cursor: postsResponse.data.cursor })
        } else {
          break
        }
      }
      console.log(`Sync posts of user ${user.url}: ${uris.length} posts`)
      for await (const uri of uris) {
        await processSinglePost(uri, false)
      }
    }

    for await (const newFollow of newFollowsToCreate) {
      await Follows.findOrCreate({
        where: {
          followedId: newFollow.id,
          followerId: userId
        },
        defaults: {
          followedId: newFollow.id,
          followerId: userId,
          muteQuotes: false,
          muteRewoots: false,
          accepted: true
        }
      })
    }
  }
}

export { syncBskyFollowersAndFollowing }
