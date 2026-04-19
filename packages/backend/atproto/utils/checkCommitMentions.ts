import { RichText } from '@atproto/api'
import { getQuotedPostUri } from './getAtProtoThread.js'
import { PostView } from '@atproto/api/dist/client/types/app/bsky/feed/defs.js'
import { Commit, CommitType, CommitCreate } from '@skyware/jetstream'
import { logger } from '../../utils/logger.js'
import { redisCache, redisBloom } from '../../utils/redis.js'
import { FOLLOWED_BSKY_DIDS_CACHE_KEY, FOLLOWED_HASHTAGS_CACHE_KEY, LOCAL_USER_DIDS_CACHE_KEY, ROOT_REPLIED_POSTS } from '../../constants.js'

// Preemptive checks to see if
async function checkCommitMentions(
  did: string,
  commit: Commit<"app.bsky.feed.threadgate" | "app.bsky.feed.like" | "app.bsky.feed.post" | "app.bsky.feed.repost" | "app.bsky.graph.block" | "app.bsky.graph.follow" | "net.wafrn.feed.bite">,
): Promise<boolean> {
  let res = false
  let record = (commit as any).record


  if(commit.collection === 'app.bsky.feed.post' && commit.operation === 'delete'){
    logger.debug('Delete post automatic accept')
    return true;
  }

  if(await redisCache.sismember(FOLLOWED_BSKY_DIDS_CACHE_KEY, did)) {
    logger.debug('Post by followed user')
    return true;
  }
  let quotedPostUri: string | undefined = undefined
  if (
      commit.operation === CommitType.Create &&
      commit.collection.startsWith('app.bsky.feed.post') &&
      (commit.record as any)?.facets
    ) {
      const mentions: string[] = record?.facets
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
        const tags = Array.from(rt.segments().filter((elem) => elem.isTag() && elem.text).map(elem => elem.text.toLowerCase().toString().trim()))
        if(tags && tags.length && (await redisCache.smismember(FOLLOWED_HASHTAGS_CACHE_KEY, tags )).some(elem => elem != 0)) {
          logger.debug('Post contains followed hashtag')
          return true;
        }
      }
      if(mentions && mentions.length && (await redisCache.smismember(LOCAL_USER_DIDS_CACHE_KEY, mentions)).some(elem => elem != 0)) {
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
      await redisCache.sismember('cache:didsToCheck', did) ||
      (await redisCache.smismember(LOCAL_USER_DIDS_CACHE_KEY, [likedPostUri, followedUser])).some(elem => elem != 0)
    ) {
      logger.debug('Saving follow')
      return true
    }
  }
  // second one first approach: is post being replied on db? if so we store it.
  record = (commit as CommitCreate<"app.bsky.feed.post">).record
  if (record && record.reply && await redisBloom.exists(ROOT_REPLIED_POSTS, record.reply.root.uri)) {
    logger.debug('Post in reply to post that we know has been replied (bloom filter)')
    return true
  }
  if(record && record.reply) {
    const rootDid = record.reply.root.uri.replace('at://', '').split('/app.bsky.feed')[0]
    const parentDid = record.reply.parent.uri.replace('at://', '').split('/app.bsky.feed')[0]
    // we check if root or parent are local users
    if((await redisCache.smismember(LOCAL_USER_DIDS_CACHE_KEY, [rootDid, parentDid] )).some(elem => elem != 0)){
      logger.debug(`Post is in reply to a post of a local user`)
      return true;
    }
  }

  if (quotedPostUri) {
    const quotedUserDid = quotedPostUri.replace('at://', '').split('/app.bsky.feed')[0] ?? ''
    res =
      await redisCache.sismember(LOCAL_USER_DIDS_CACHE_KEY, quotedUserDid ) != 0

    if (res) {
      logger.debug('Post quotes local user')

      return res};
  }

  return res
}

export { checkCommitMentions }
