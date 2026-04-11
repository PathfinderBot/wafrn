import { RichText } from '@atproto/api'
import { getQuotedPostUri } from './getAtProtoThread.js'
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs.js'
import { Commit, CommitType, CommitCreate } from '@skyware/jetstream'
import { logger } from '../../utils/logger.js'

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
  let res = false
  let record = (commit as any).record


  if(commit.collection === 'app.bsky.feed.post' && commit.operation === 'delete'){
    logger.debug('Delete post automatic accept')
    return true;
  }
  const didsToCheck = cacheData.followedDids
  let quotedPostUri: string | undefined = undefined
  if (
      commit.operation === CommitType.Create &&
      commit.collection.startsWith('app.bsky.feed.post') &&
      (commit.record as any)?.facets
    ) {
      const mentions = record?.facets
        .flatMap((elem: any) => elem.features)
        .map((elem: any) => elem.did)
        .filter((elem: any) => elem)
      try {
        quotedPostUri = getQuotedPostUri({ record } as PostView)

      } catch(error: any) {}
      if (record.text) {
        const rt = new RichText({
          text: record.text,
          facets: record.facets
        })
        let tags = rt.segments().filter((elem) => elem.isTag())
        if (tags && tags.some((tag) => cacheData.followedHashtags.has(tag.text.substring(1).toLowerCase()))) {
          logger.debug('Post contains followed hashtag')
          return true
        }
      }

      if (mentions && mentions.length && mentions.some((mention: string) => cacheData.localUserDids.has(mention))) {
        logger.debug('Post contains a mention of a local user')
        return res
      }
    }
  // first we check if there are any mentions to local users. if so we return true

  // we check lik
  if (
    commit.operation === CommitType.Create &&
    (commit.collection.startsWith('app.bsky.feed.like') || commit.collection.startsWith('app.bsky.graph.follow'))
  ) {
    // we do not ned 18k likes on a mark hamill post. We better do just a "people you follow liked..."
    let likedPostUri = record?.subject?.uri ? record?.subject.uri : ''
    if (likedPostUri) {
      likedPostUri = likedPostUri.split('/')[2]
    }
    const followedUser = commit.collection.startsWith('app.bsky.graph.follow') ? record?.subject : ''

    if (
      didsToCheck.has(did) ||
      cacheData.localUserDids.has(likedPostUri) ||
      cacheData.localUserDids.has(followedUser)
    ) {
      logger.debug('Saving follow')
      return true
    }
  }
  // second one first approach: is post being replied on db? if so we store it.
  record = (commit as CommitCreate<"app.bsky.feed.post">).record
  if (record && record.reply) {
    const root = record.reply.root.uri.replace('at://', '').split('/app.bsky.feed')[0]
    const parent = record.reply.parent.uri.replace('at://', '').split('/app.bsky.feed')[0]
    res =
      // lets  store by default less replies. only ones that are replies to local users
      cacheData.followedDids.has(parent) ||
      cacheData.localUserDids.has(root) 

    if (res) {
      logger.debug('Post in reply to local user')
      return res;}
  }

  if (record && record.embed && (record.embed.$type === 'app.bsky.embed.record' || record.embed.$type === 'app.bsky.embed.recordWithMedia')) {
    const uri = (record.embed.record as { uri: string | undefined }).uri?.replace('at://', '').split('/app.bsky.feed')[0] ?? ''
    res =
      cacheData.localUserDids.has(uri)

    if (res) {
      logger.debug('Post quotes local user')

      return res};
  }

  return res
}

export { checkCommitMentions }
