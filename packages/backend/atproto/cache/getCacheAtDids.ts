import { Follows, User } from '../../models/index.js'
import { Op } from 'sequelize'
import { getAllLocalUserIds } from '../../utils/cacheGetters/getAllLocalUserIds.js'
import { Queue } from 'bullmq'
import { UserFollowHashtags } from '../../models/userFollowHashtag.js'
import { completeEnvironment } from '../../utils/backendOptions.js'
import { redisCache } from '../../utils/redis.js'

let superCache:
  | undefined
  | {
      followedDids: Set<string>
      localUserDids: Set<string>
      followedUsersLocalIds: Set<string>
      followedHashtags: Set<string>
    }

// TODO improve this. This function is called A LOT and we could use a lot less of JSON PARSE
async function getCacheAtDids(forceUpdate = false): Promise<{
  followedDids: Set<string>
  localUserDids: Set<string>
  followedUsersLocalIds: Set<string>
  followedHashtags: Set<string>
}> {
  if (!forceUpdate && superCache) {
    return superCache
  }
  let cacheResult = forceUpdate ? undefined : superCache
  if (!cacheResult) {
    const superRedisStarter = await redisCache.get('cacheDids')
    const tmpRedisVersion:
      {
        followedDids: string[];
        localUserDids: string[];
        followedUsersLocalIds: string[];
        followedHashtags: string[];
      } = superRedisStarter ? JSON.parse(superRedisStarter) : {followedDids: [], localUserDids: [], followedUsersLocalIds: [], followedHashtags: []}
    const localIds = await getAllLocalUserIds()
    const followsPromise = Follows.findAll({
      include: [
        {
          model: User,
          as: 'followed',
          where: {
            bskyDid: {
              [Op.ne]: null,
              [Op.notIn]: tmpRedisVersion.followedDids
            }
          },
          required: true
        }
      ],
      attributes: ['followedId'],
      //group: ['followedId'],
      where: {
        followerId: localIds
      }
    })
    const localUsersWithDidPromise = User.findAll({
      attributes: ['bskyDid'],
      where: {
        id: localIds,
        bskyDid: {
          [Op.ne]: null,
          [Op.notIn]: tmpRedisVersion.localUserDids
        }
      }
    })
    const [follows, localUsersWithDid] = await Promise.all([followsPromise, localUsersWithDidPromise])

    const dids = await User.findAll({
      attributes: ['bskyDid', 'id'],
      where: {
        id: {
          [Op.in]: follows.map((elem) => elem.followedId)
        },
        email: {
          [Op.eq]: null
        },
        bskyDid: {
          [Op.ne]: null
        }
      }
    })

    const followedUsersLocalIds = new Set<string>(dids.map((elem) => elem.id).filter((elem) => elem != '').concat(tmpRedisVersion.followedUsersLocalIds))
    const localUserDids = new Set<string>(
      localUsersWithDid.map((elem) => elem.bskyDid || '').filter((elem) => elem != '').concat(tmpRedisVersion.localUserDids)
    )
    const followedDids = new Set<string>([
      ...dids.map((elem) => elem.bskyDid || '').filter((elem) => elem != ''),
      ...Array.from(localUserDids),
      ...tmpRedisVersion.followedDids
    ])

    const followedHashtagsQuery = await UserFollowHashtags.findAll({
      attributes: ['tagName']
    })

    const followedHashtags = new Set<string>(
      followedHashtagsQuery
        .map((elem) => elem.tagName)
        .filter((elem) => !!elem)
        .map((elem) => elem.toLowerCase())
        .concat(tmpRedisVersion.followedHashtags)
    )

    cacheResult = {
      followedDids: followedDids,
      localUserDids: localUserDids,
      followedUsersLocalIds: followedUsersLocalIds,
      followedHashtags: followedHashtags
    }
    const redisVersion = {
      followedDids: Array.from(followedDids),
      localUserDids: Array.from(localUserDids),
      followedUsersLocalIds: Array.from(followedUsersLocalIds),
      followedHashtags: Array.from(followedHashtags)
    }
    await redisCache.set('cacheDids', JSON.stringify(redisVersion))
  }
  superCache = cacheResult
  return cacheResult
}

async function forceUpdateCacheDidsAtThread() {
  const forceUpdaDidsteQueue = new Queue('forceUpdateDids', {
    connection: completeEnvironment.bullmqConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  })
  await forceUpdaDidsteQueue.add('forceUpdateDids', {})
}

export { getCacheAtDids, forceUpdateCacheDidsAtThread }
