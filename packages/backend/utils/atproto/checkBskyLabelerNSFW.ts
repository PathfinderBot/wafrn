import { Op } from 'sequelize'
import { promiseRace } from '../../atproto/utils/promiseRace.js'
import { Post } from '../../models/index.js'
import { getAllLocalUserIdsSet } from '../cacheGetters/getAllLocalUserIds.js'
import { logger } from '../logger.js'
import { getAdminAtprotoSession } from './getAdminAtprotoSession.js'

async function checkBskyLabelersNSFW(posts: Post[]): Promise<void> {
  if (posts.length == 0) {
    return
  }
  try {
    const localUsers = await getAllLocalUserIdsSet()
    const eligiblePosts = posts.filter((elem) => elem.bskyUri && !localUsers.has(elem.userId))
    const reblogsNeedingParent = eligiblePosts.filter((elem) => elem.isReblog && elem.parentId)
    const parentPosts = reblogsNeedingParent.length
      ? await Post.findAll({
          where: {
            id: { [Op.in]: reblogsNeedingParent.map((elem) => elem.parentId as string) }
          }
        })
      : []
    const parentBskyUriById = new Map(parentPosts.map((parent) => [parent.id, parent.bskyUri]))
    const postsByQueryUri = new Map<string, Post[]>()
    for (const post of eligiblePosts) {
      const queryUri = post.isReblog && post.parentId ? parentBskyUriById.get(post.parentId) : post.bskyUri
      if (!queryUri) continue
      const existing = postsByQueryUri.get(queryUri) ?? []
      existing.push(post)
      postsByQueryUri.set(queryUri, existing)
    }

    const dids: string[] = Array.from(postsByQueryUri.keys())
    if (dids.length === 0) return

    const agent = await getAdminAtprotoSession()
    const getLabelsPetition = agent.com.atproto.label.queryLabels({
      uriPatterns: dids,
      // hardcoded: bsky moderation service
      sources: ['did:plc:ar7c4by46qjdydhdevvrndac']
    })
    const petitionResult = (await promiseRace([getLabelsPetition], 5000))[0]
    if (petitionResult?.data?.labels && petitionResult.data.labels.length > 0) {
      const labels: Map<string, string[]> = new Map()
      for await (const label of petitionResult.data.labels) {
        if (!labels.get(label.uri)) {
          labels.set(label.uri, [])
        }
        if (label.neg && labels.has(label.val)) {
          labels.set(
            label.uri,
            (labels.get(label.uri) as string[]).filter((elem) => elem != label.val)
          )
        } else {
          labels.set(label.uri, (labels.get(label.uri) as string[]).concat([label.val]))
        }
      }
      for await (const uri of labels.keys()) {
        const postsToLabel = postsByQueryUri.get(uri) ?? []
        const postLabels = labels.get(uri)
        if (postsToLabel.length && postLabels?.length) {
          const contentWarning = `Post labeled as ${postLabels.join(',')}`
          for await (const postToLabel of postsToLabel) {
            postToLabel.content_warning = contentWarning
            await postToLabel.save()
          }
        }
      }
    }
  } catch (error) {
    logger.info({ message: `Error on getting bsky labeler`, error })
  }
}

export { checkBskyLabelersNSFW }
