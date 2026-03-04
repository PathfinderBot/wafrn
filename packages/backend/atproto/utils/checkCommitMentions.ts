import { ParsedCommit } from '@skyware/firehose'
import { Post } from '../../models/index.js'
import { Op, Sequelize } from 'sequelize'
import { getAllLocalUserIds } from '../../utils/cacheGetters/getAllLocalUserIds.js'
import { RichText } from '@atproto/api'
import { getQuotedPostUri } from './getAtProtoThread.js'
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs.js'
import { Commit, Collection, CommitBase, CommitType, CommitCreate } from '@skyware/jetstream'

// Preemptive checks to see if
function checkCommitMentions(
  did: string,
  commit: Commit<"app.bsky.feed.threadgate" | "app.bsky.feed.like" | "app.bsky.feed.post" | "app.bsky.feed.repost" | "app.bsky.graph.block" | "app.bsky.graph.follow" | "net.wafrn.feed.bite">,
  cacheData: {
    followedDids: Set<string>
    localUserDids: Set<string>
    followedUsersLocalIds: Set<string>
    followedHashtags: Set<string>
  }
): boolean {
  if(commit.collection === 'app.bsky.feed.post' && commit.operation === 'delete'){
    return true;
  }
  const didsToCheck = cacheData.followedDids
  let quotedPostUri: string | undefined = undefined
  let res = false
  // first we check if there are any mentions to local users. if so we return true
  // TODO nuke this
  if (commit.collection.startsWith('app.bsky.feed.like') || commit.collection.startsWith('app.bsky.graph.follow')) {
    //return false
  }
  // we check lik
  if (
    commit.operation === CommitType.Create &&
    (commit.collection.startsWith('app.bsky.feed.like') || commit.collection.startsWith('app.bsky.graph.follow'))
  ) {
    let record: any = commit.record
    // we do not ned 18k likes on a mark hamill post. We better do just a "people you follow liked..."
    let likedPostUri = record?.subject?.uri ? record?.subject.uri : ''
    if (likedPostUri) {
      likedPostUri = likedPostUri.split('/')[2]
    }
    let followedUser = commit.collection.startsWith('app.bsky.graph.follow') ? record?.subject : ''

    if (
      didsToCheck.has(did) ||
      cacheData.localUserDids.has(likedPostUri) ||
      cacheData.localUserDids.has(followedUser)
    ) {
      return true
    }
    if (
      commit.operation === CommitType.Create &&
      commit.collection.startsWith('app.bsky.feed.post') &&
      (commit.record as any)?.facets
    ) {
      let record: any = commit.record
      const mentions = record?.facets
        .flatMap((elem: any) => elem.features)
        .map((elem: any) => elem.did)
        .filter((elem: any) => elem)
      quotedPostUri = getQuotedPostUri({ record } as PostView)
      if (record.text) {
        const rt = new RichText({
          text: record.text,
          facets: record.facets
        })
        let tags = rt.segments().filter((elem) => elem.isTag())
        if (tags && tags.some((tag) => cacheData.followedHashtags.has(tag.text.substring(1).toLowerCase()))) {
          res = true
          return true
        }
      }

      if (mentions && mentions.length && mentions.some((mention: string) => cacheData.localUserDids.has(mention))) {
        res = true
        return res
      }
    }
  }
  // second one first approach: is post being replied on db? if so we store it.
  let record = (commit as CommitCreate<"app.bsky.feed.post">).record
  if (record && record.reply) {
    const root = record.reply.root.uri.replace('at://', '').split('/app.bsky.feed')[0]
    const parent = record.reply.parent.uri.replace('at://', '').split('/app.bsky.feed')[0]
    res =
      cacheData.followedDids.has(root) || cacheData.followedDids.has(parent) ||
      cacheData.localUserDids.has(root) || cacheData.followedDids.has(parent)

    if (res) return res;
  }

  if (record && record.embed && (record.embed.$type === 'app.bsky.embed.record' || record.embed.$type === 'app.bsky.embed.recordWithMedia')) {
    const uri = (record.embed.record as { uri: string | undefined }).uri?.replace('at://', '').split('/app.bsky.feed')[0] ?? ''
    res =
      cacheData.followedDids.has(uri) || cacheData.localUserDids.has(uri)

    if (res) return res;
  }

  return res
}

export { checkCommitMentions }
