import { Application, Response } from 'express'
import { Op, QueryTypes } from 'sequelize'
import { Emoji, Post, PostTag, User, UserEmojiRelation } from '../models/index.js'
import { sequelize } from '../models/index.js'
import { authenticateToken } from '../utils/authenticateToken.js'

import { searchRemoteUser } from '../activitypub/searchRemoteUser.js'
import { getRemoteActor } from '../activitypub/getRemoteActor.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { getallBlockedServers } from '../utils/cacheGetters/getAllBlockedServers.js'
import { getUnjointedPosts } from '../services/baseQueryNew.js'
import { getAtprotoUser } from '../atproto/utils/getAtprotoUser.js'
import { resolveHandle } from '../atproto/utils/resolveHandleToDid.js'
import { logger } from '../utils/logger.js'
import { Privacy } from '../models/post.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { addHandlePrefix, splitHandle } from '../models/user.js'
import { processSinglePost } from '../atproto/utils/getAtProtoThread.js'
export default function searchRoutes(app: Application) {
  app.get('/api/userSearch/:term', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const posterId = req.jwtData?.userId ? req.jwtData.userId : '00000000-0000-0000-0000-000000000000'
    // const success = false;
    let users: any = []
    const searchTerm = req.params.term.trim()
    users = await searchUsers(searchTerm, posterId, 0)
    res.send({
      users
    })
  })

  app.get('/api/v2/search', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    const posterId = req.jwtData?.userId ? req.jwtData.userId : '00000000-0000-0000-0000-000000000000'
    // const success = false;
    const searchTerm = (req.query.term || '').toString().trim()
    const page = Number(req?.query.page) || 0
    const forceSearchUser = (req.query.user || '').toString().trim()
    let forceSearchUserId: string | undefined = undefined
    let urlString = ''
    let postsIds: Promise<string[]> | string[] = []
    let users: Promise<User[]> | User[] = []
    if (forceSearchUser != '') {
      const forceSearchUserObject = await User.findOne({
        attributes: ['url', 'avatar', 'name', 'description', 'remoteId', 'bskyDid', 'federatedHostId', 'id'],
        where: {
          [Op.or]: [
            sequelize.where(sequelize.fn('lower', sequelize.col('url')), forceSearchUser),
            sequelize.where(sequelize.fn('lower', sequelize.col('alternateUrl')), forceSearchUser)
          ]
        }
      })
      if (forceSearchUserObject) {
        forceSearchUserId = forceSearchUserObject.id
      }
    }
    try {
      const url = new URL(searchTerm)
      // remove search params and hashes
      url.search = ''
      url.hash = ''

      urlString = url.href
    } catch (error) {}
    if ((urlString || searchTerm.startsWith('at://')) && !page) {
      // we force fetch said remote post. Nothing eslse!
      const userPoster = await User.findByPk(posterId)
      if (userPoster) {
        if (
          completeEnvironment.enableBsky &&
          userPoster.enableBsky &&
          userPoster.bskyDid &&
          ((urlString.toLowerCase().includes('/profile/') && urlString.toLowerCase().includes('/post/')) ||
            searchTerm.startsWith('at://'))
        ) {
          // try resolving as bsky post
          try {
            let uri = searchTerm
            if (!searchTerm.startsWith('at://')) {
              urlString = decodeURIComponent(urlString) // done this due to red dwarf
              const profileAndPost = urlString.includes('app.bsky.feed.post')
                ? urlString.split('aturi.to/')[1].split('/app.bsky.feed.post/')
                : urlString.split('/profile/')[1].split('/post/')
              let bskyProfile = profileAndPost[0]
              const bskyUri = profileAndPost[1]
              if (!bskyProfile.startsWith('did:')) {
                const resolvedDid = await resolveHandle(bskyProfile, false)
                if (resolvedDid) bskyProfile = resolvedDid
              }
              uri = `at://${bskyProfile}/app.bsky.feed.post/${bskyUri}`
            }
            const bskyPostId = await processSinglePost(uri, true)
            if (bskyPostId) {
              postsIds = [bskyPostId]
            }
          } catch (error) {
            logger.debug({
              message: `Error in search obtaining bsky post ${searchTerm}, trying fedi`,
              error
            })
          }
        }

        // else, fedi post
        try {
          const remotePost = await getPostThreadRecursive(userPoster, urlString)
          if (remotePost) {
            await getPostThreadRecursive(userPoster, urlString, undefined, remotePost.id)
            postsIds = [remotePost.id]
          }
        } catch (error) {
          logger.debug({
            message: `Error in search obtaining fedi post ${searchTerm}`,
            error
          })
        }

        if ((postsIds as string[]).length === 0) {
          try {
            const remoteUser = await getRemoteActor(urlString, userPoster, true)
            if (remoteUser && remoteUser.url !== completeEnvironment.deletedUser) {
              users = [remoteUser]
            }
          } catch (error) {
            logger.debug({
              message: `Error in search obtaining fedi user ${searchTerm}`,
              error
            })
          }
        }
      }
    } else {
      users = await searchUsers(searchTerm, posterId, page)
      postsIds = searchPosts(searchTerm, posterId, page, {
        userId: forceSearchUserId
      })
    }

    await Promise.all([users, postsIds])
    users = await users
    postsIds = await postsIds
    const userEmojiIds = await UserEmojiRelation.findAll({
      attributes: ['emojiId', 'userId'],
      where: {
        userId: {
          [Op.in]: users.map((elem) => elem.id)
        }
      }
    })
    const emojiIds = userEmojiIds.map((e: any) => e.emojiId)
    const emojis = await Emoji.findAll({
      attributes: ['id', 'url', 'external', 'name'],
      where: {
        id: {
          [Op.in]: emojiIds
        }
      }
    })
    res.send({
      emojis,
      userEmojiIds,
      foundUsers: users,
      posts: await getUnjointedPosts(postsIds, posterId, true)
    })
  })

  async function searchUsers(searchTerm: string, userId: string, page = 0): Promise<User[]> {
    let remoteMatch: Promise<User | null> | null = null
    let firstMatch: Promise<User | null> | null = null
    if (!page)
      firstMatch = User.findOne({
        attributes: ['url', 'avatar', 'name', 'description', 'remoteId', 'bskyDid', 'federatedHostId', 'id'],
        where: {
          activated: true,
          banned: {
            [Op.ne]: true
          },
          [Op.or]: [
            sequelize.where(sequelize.fn('lower', sequelize.col('url')), searchTerm),
            sequelize.where(sequelize.fn('lower', sequelize.col('alternateUrl')), searchTerm)
          ]
        }
      })
    if (page == 0) {
      remoteMatch = searchUserFediAndbsky(searchTerm, (await User.findByPk(userId)) as User)
    }
    // we only start displaying remote users when we have finished with local users
    const localUsersCount = await User.count({
      where: {
        activated: true,
        banned: {
          [Op.ne]: true
        },
        email: {
          [Op.ne]: null
        },
        url: {
          [Op.iLike]: `%${searchTerm}%`
        }
      }
    })
    let localUsers: User[] = []
    if (localUsersCount >= page * completeEnvironment.postsPerPage)
      localUsers = await User.findAll({
        where: {
          activated: true,
          banned: {
            [Op.ne]: true
          },
          email: {
            [Op.ne]: null
          },
          url: {
            [Op.iLike]: `%${searchTerm}%`
          }
        },
        attributes: ['url', 'avatar', 'name', 'description', 'remoteId', 'bskyDid', 'federatedHostId', 'id'],
        order: [['createdAt', 'DESC']],
        limit: completeEnvironment.postsPerPage,
        offset: page * completeEnvironment.postsPerPage
      })
    const remoteUsersPage = page - Math.floor(localUsersCount / completeEnvironment.postsPerPage)
    let remoteUsers: Promise<User[]> | User[] = []
    if (remoteUsersPage >= 0)
      remoteUsers = User.findAll({
        where: {
          activated: true,
          email: null,
          banned: {
            [Op.ne]: true
          },
          url: {
            [Op.iLike]: `%${searchTerm}%`
          },
          [Op.or]: [
            {
              federatedHostId: {
                [Op.notIn]: await getallBlockedServers()
              }
            },
            {
              federatedHostId: {
                [Op.eq]: null
              }
            }
          ]
        },
        attributes: ['url', 'avatar', 'name', 'description', 'remoteId', 'bskyDid', 'federatedHostId', 'id'],
        order: [['createdAt', 'DESC']],
        limit: completeEnvironment.postsPerPage,
        offset: remoteUsersPage * completeEnvironment.postsPerPage
      })

    const tmp = await Promise.all([firstMatch, localUsers, remoteUsers, remoteMatch])
    if (await remoteMatch) {
      firstMatch = remoteMatch
    }
    let res: User[] = []
    if (await firstMatch) {
      res.push((await firstMatch) as User)
    }
    res = res.concat(await localUsers)
    if ((await remoteUsers) && (await remoteUsers).length >= 1) {
      const tmpRemote = await remoteUsers
      res = res.concat(tmpRemote as User[])
    }
    // we want to check that we dont get duplicated users
    const resUrls = res.map((elem) => elem.url)
    return res.filter((elem, index) => resUrls.indexOf(elem.url) == index)
  }

  async function searchUserFediAndbsky(searchTermIncomplete: string, usr: User): Promise<User | null> {
    // WILL ALWAYS ADD INITIAL @ SO WE CAN AUTOCOMPLETE ON POST EDITOR
    // search exact url match and forces update in local db.
    // only search in bsky if user has enabed bsky
    const searchTerm = addHandlePrefix(searchTermIncomplete)

    const searchData = splitHandle(searchTerm)

    let result: User | null | undefined = null

    if (completeEnvironment.enableBsky && usr.enableBsky && searchData.type === 'bluesky' && usr.bskyDid) {
      try {
        const bskySearchResult = await getAtprotoUser(searchData.handle)
        if (bskySearchResult && bskySearchResult.url != completeEnvironment.deletedUser) {
          result = bskySearchResult
        }
      } catch (error) {
        logger.debug({
          message: `Error in search of bsky user: ${searchTerm}`,
          error
        })
      }
    }

    // we have a full @fediUser@fediServer url. Time to search!
    if (!result && searchData.type === 'fediverse') {
      result = await searchRemoteUser(searchTerm, usr)
    }
    return result || null
  }

  // this method will only search posts in the database localy, not remote petitions
  // petitions of remote posts shall be done in the search endpoint itself
  async function searchPosts(
    searchTerm: string,
    userId: string,
    page: number,
    options?: {
      // optional options: userId: if userid we only search posts from said user
      userId?: string
    }
  ): Promise<string[]> {
    const perPage = completeEnvironment.postsPerPage
    const privacyFilter = [Privacy.Public, Privacy.LocalOnly]
    const userFilterSql = options?.userId ? 'AND "post"."userId" = :filterUserId' : ''

    // --- Count exact matches (capped at 5000 so this stays cheap) ---
    const totalPostExactMatchQuery: any = await sequelize.query(
      `SELECT count(*) AS "count"
     FROM (
       SELECT 1
       FROM "postTags" AS "postTags"
       INNER JOIN "posts" AS "post"
         ON "postTags"."postId" = "post"."id"
         AND "post"."privacy" IN (:privacy)
         ${userFilterSql}
       WHERE lower("postTags"."tagName") = lower(:searchParam)
       LIMIT 5000
     ) sub;`,
      {
        replacements: {
          searchParam: searchTerm,
          privacy: privacyFilter,
          ...(options?.userId ? { filterUserId: options.userId } : {})
        },
        type: QueryTypes.SELECT
      }
    )
    const totalPostExactMatch = Number(totalPostExactMatchQuery[0].count)

    let completeMatch: Promise<any[]> | any[] | null = null
    let looseMatch: Promise<any[]> | any[] | null = null

    // --- Exact tag matches ---
    if (totalPostExactMatch >= page * perPage || totalPostExactMatch === 5000) {
      completeMatch = sequelize.query(
        `WITH matched AS (
         SELECT "id", "postId", "createdAt"
         FROM "postTags"
         WHERE lower("tagName") = lower(:searchParam)
         OFFSET 0
       )
       SELECT matched."postId"
       FROM matched
       INNER JOIN "posts" AS post
         ON matched."postId" = post."id"
         AND post."privacy" IN (:privacy)
         ${userFilterSql}
       ORDER BY matched."createdAt" DESC
       LIMIT :limit OFFSET :offset;`,
        {
          replacements: {
            searchParam: searchTerm,
            privacy: privacyFilter,
            limit: perPage,
            offset: page * perPage,
            ...(options?.userId ? { filterUserId: options.userId } : {})
          },
          type: QueryTypes.SELECT
        }
      )
    }

    // --- Loose (substring) tag matches, excluding exact matches already covered above ---
    const looseSearchPage = page - Math.floor(totalPostExactMatch / perPage)
    if (looseSearchPage >= 0) {
      looseMatch = sequelize.query(
        `WITH matched AS (
         SELECT "id", "postId", "createdAt"
         FROM "postTags"
         WHERE "tagName" ILIKE :loosePattern
           AND "tagName" NOT ILIKE :searchParam
         OFFSET 0
       )
       SELECT matched."postId"
       FROM matched
       INNER JOIN "posts" AS post
         ON matched."postId" = post."id"
         AND post."privacy" IN (:privacy)
         ${userFilterSql}
       ORDER BY matched."createdAt" DESC
       LIMIT :limit OFFSET :offset;`,
        {
          replacements: {
            loosePattern: `%${searchTerm}%`,
            searchParam: searchTerm,
            privacy: privacyFilter,
            limit: perPage,
            offset: looseSearchPage * perPage,
            ...(options?.userId ? { filterUserId: options.userId } : {})
          },
          type: QueryTypes.SELECT
        }
      )
    }

    const [completeRows, looseRows] = await Promise.all([completeMatch, looseMatch])

    let res: string[] = []
    if (completeRows && completeRows.length > 0) {
      res = res.concat(completeRows.map((r: any) => r.postId))
    }
    if (looseRows && looseRows.length > 0) {
      res = res.concat(looseRows.map((r: any) => r.postId))
    }
    return res
  }
}
