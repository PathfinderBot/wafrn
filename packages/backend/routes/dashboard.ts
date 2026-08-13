import { Application, Response } from 'express'
import optionalAuthentication from '../utils/optionalAuthentication.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import {
  FederatedHost,
  Follows,
  Post,
  PostMentionsUserRelation,
  PostTag,
  sequelize,
  User,
  UserOptions
} from '../models/index.js'
import { Op } from 'sequelize'
import getStartScrollParam from '../utils/getStartScrollParam.js'
import getFollowedsIds from '../utils/cacheGetters/getFollowedsIds.js'
import getNonFollowedLocalUsersIds from '../utils/cacheGetters/getNotFollowedLocalUsersIds.js'
import getBlockedIds from '../utils/cacheGetters/getBlockedIds.js'
import { getUnjointedPosts } from '../services/baseQueryNew.js'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import { navigationRateLimiter } from '../utils/rateLimiters.js'
import { Privacy } from '../models/post.js'
import { getFollowedHashtags } from '../utils/cacheGetters/getFollowedHashtags.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { logger } from '../utils/logger.js'
import { handleBskyFeed } from '../atproto/utils/handleBskyFeed.js'
import { promiseRace } from '../atproto/utils/promiseRace.js'

export default function dashboardRoutes(app: Application) {
  app.get(
    '/api/v2/dashboard',
    optionalAuthentication,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      const level = parseInt(req.query.level as string) // level of dashboard: localExplore, explore, dashboard or DMs
      const posterId = req.jwtData?.userId ? req.jwtData?.userId : '00000000-0000-0000-0000-000000000000'
      const POSTS_PER_PAGE = completeEnvironment.postsPerPage

      // level: 0 explore 1 dashboard 2 localExplore 10 dms
      if (level !== 2 && posterId === '00000000-0000-0000-0000-000000000000') {
        res.sendStatus(401)
        return
      }

      let postsWithTags: Promise<PostTag[]> | PostTag[] = []
      let whereObject: any = {
        privacy: Privacy.Public
      }
      const baseUserOptions = await UserOptions.findAll({
        where: {
          userId: posterId,
          optionName: {
            [Op.in]: ['wafrn.disableReplies', 'wafrn.disableBsky']
          }
        }
      })
      const getBaseOption = (name: string) =>
        baseUserOptions.find((opt) => opt.optionName === name)?.optionValue === 'true'
      const disableReplies = getBaseOption('wafrn.disableReplies')
      const disableBsky = getBaseOption('wafrn.disableBsky')
      const disableRepliesOr = disableReplies
        ? [
            {
              isReblog: true
            },
            {
              isReply: false
            }
          ]
        : []

      if (disableBsky) {
        disableRepliesOr.push({
          isBskyExclusive: false
        } as any)
      }

      switch (level) {
        case 2: {
          const [dbOptiondisableRewootsExploreLocal, followedUsers, nonFollowedUsers] = await Promise.all([
            UserOptions.findOne({
              where: {
                userId: posterId,
                optionName: 'wafrn.disableRewootsExploreLocal'
              }
            }),
            getFollowedsIds(posterId, true),
            getNonFollowedLocalUsersIds(posterId)
          ])

          const hideReblogs = dbOptiondisableRewootsExploreLocal?.optionValue === 'true'

          const and: any = [
            {
              [Op.or]: [
                {
                  privacy: {
                    [Op.in]: [Privacy.Public, Privacy.FollowersOnly, Privacy.LocalOnly]
                  },
                  userId: {
                    [Op.in]: followedUsers
                  }
                },
                {
                  privacy: {
                    [Op.in]: req.jwtData?.userId ? [Privacy.Public, Privacy.LocalOnly] : [Privacy.Public] // only display public if not logged in
                  },
                  userId: {
                    [Op.in]: nonFollowedUsers
                  }
                },
                {
                  userId: posterId,
                  privacy: {
                    [Op.ne]: Privacy.DirectMessage
                  }
                }
              ]
            }
          ]

          if (disableReplies || disableBsky) {
            and.push({
              [Op.or]: disableRepliesOr
            })
          }

          whereObject = {
            detached: { [Op.ne]: true },
            [Op.and]: and,
            isReblog: {
              [Op.in]: hideReblogs ? [false, null] : [true, false, null]
            }
          }

          break
        }
        case 1: {
          const [user, followedIds, subscribedTags, dbOptionDisableRewootsDashboard, hiddenRepliesFollows] =
            await Promise.all([
              User.findByPk(posterId),
              getFollowedsIds(posterId),
              getFollowedHashtags(posterId),
              UserOptions.findOne({
                where: {
                  userId: posterId,
                  optionName: 'wafrn.disableRewootsDashboard'
                }
              }),
              Follows.findAll({
                attributes: ['followedId'],
                where: {
                  followerId: posterId,
                  hideReplies: true
                }
              })
            ])
          const hiddenRepliesUserIds = hiddenRepliesFollows.map((follow) => follow.followedId)

          if (
            completeEnvironment.enableBsky &&
            completeEnvironment.enableBskyFallbackDashboard &&
            user &&
            user.enableBsky &&
            user.bskyDid
          ) {
            try {
              // we give bluesky 2.5 seconds to load
              await promiseRace([handleBskyFeed(user, getStartScrollParam(req))], 2500)
            } catch (error) {
              logger.debug({
                message: `Error obtaining bsky feed of user ${user.url}`,
                error: error
              })
            }
          }
          const orConditions: any = [
            {
              userId: { [Op.in]: followedIds },
              detached: { [Op.ne]: true }
            }
          ]

          const hideReblogs = dbOptionDisableRewootsDashboard?.optionValue === 'true'

          if (subscribedTags && subscribedTags.length > 0) {
            // query: get posts with hashtag thing
            postsWithTags = PostTag.findAll({
              include: [
                {
                  model: Post,
                  attributes: ['privacy', 'id', 'createdAt'],
                  where: {
                    privacy: 0
                  }
                }
              ],
              where: {
                tagName: {
                  [Op.iLike]: {
                    [Op.any]: subscribedTags
                  }
                },
                [Op.and]: [
                  {
                    createdAt: { [Op.lt]: getStartScrollParam(req) }
                  },
                  {
                    // limit the tags to 72 hours for test reasons. increase later. a scroll page (20 posts) should be at much 24 hours?
                    createdAt: { [Op.gt]: new Date(getStartScrollParam(req).getTime() - 72 * 3600) }
                  }
                ]
              },
              limit: POSTS_PER_PAGE,
              order: [['createdAt', 'DESC']]
            })
          }

          const and: any = [
            {
              [Op.or]: orConditions
            }
          ]

          if (disableReplies || disableBsky) {
            and.push({
              [Op.or]: disableRepliesOr
            })
          }

          if (hiddenRepliesUserIds.length > 0) {
            and.push({
              [Op.not]: {
                [Op.and]: [
                  { isReply: true },
                  { isReblog: { [Op.ne]: true } },
                  { userId: { [Op.in]: hiddenRepliesUserIds } }
                ]
              }
            })
          }

          whereObject = {
            privacy: { [Op.in]: [Privacy.Public, Privacy.FollowersOnly, Privacy.LocalOnly, Privacy.Unlisted] },
            isReblog: {
              [Op.in]: hideReblogs ? [false, null] : [true, false, null]
            },
            [Op.and]: and
          }

          break
        }
        case 0: {
          whereObject = {
            privacy: Privacy.Public,
            isReblog: false,
            [Op.or]: [
              {
                '$user.federatedHost.bubbleTimeline$': true
              },
              {
                '$user.federatedHostId$': null,
                '$user.email$': {
                  [Op.ne]: null
                }
              }
            ]
          }

          if (disableReplies) whereObject.parentId = null

          break
        }
        case 10: {
          const [dms, myPosts] = await Promise.all([
            PostMentionsUserRelation.findAll({
              order: [['createdAt', 'DESC']],
              limit: POSTS_PER_PAGE,
              where: {
                userId: posterId,
                createdAt: { [Op.lt]: getStartScrollParam(req) }
              }
            }),
            Post.findAll({
              // TODO fix this! there is a THEORETICAL posibility of something going wrong. using all user dms can be too much but just get them between here and last post...
              attributes: ['id'],
              order: [['createdAt', 'DESC']],
              limit: POSTS_PER_PAGE * 10,
              where: {
                userId: posterId,
                privacy: Privacy.DirectMessage,
                createdAt: {
                  [Op.lt]: getStartScrollParam(req)
                }
              }
            })
          ])

          whereObject = {
            privacy: Privacy.DirectMessage,
            [Op.or]: [
              {
                id: {
                  [Op.in]: dms.map((pst: any) => pst.postId).concat(myPosts.map((pst: any) => pst.id)) //latestMentionedPosts.map((elem: any) => elem.id)
                },
                userId: {
                  [Op.notIn]: await getBlockedIds(posterId)
                }
              }
            ]
          }
          break
        }
        case 25: {
          whereObject = {
            id: {
              [Op.in]: await getMutedPosts(posterId)
            }
          }
          break
        }
        case 50: {
          whereObject = {
            [Op.and]: [
              sequelize.literal(
                `"posts"."id" IN (SELECT "postId" FROM "userBookmarkedPosts" WHERE "userId" = :posterId)`
              )
            ]
          }
          break
        }
        case 30: {
          // drafts
          whereObject = {
            userId: posterId,
            privacy: Privacy.Draft
          }
          break
        }
      }
      // we get the list of posts
      let postIds: Post[] | Promise<Post[]> = Post.findAll({
        include: [
          {
            model: User,
            as: 'user',
            required: true,
            attributes: [],
            include: [
              {
                model: FederatedHost,
                required: false,
                attributes: level === 0 ? ['bubbleTimeline'] : []
              }
            ],
            where: {
              banned: false
            }
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: POSTS_PER_PAGE,
        attributes: ['id', 'createdAt'],
        subQuery: false,
        replacements: { posterId: posterId || '00000000-0000-0000-0000-000000000000' },
        where: {
          createdAt: { [Op.lt]: getStartScrollParam(req) },
          [Op.or]: [
            { waitToSendPost: { [Op.ne]: true } },
            { userId: posterId || '00000000-0000-0000-0000-000000000000' }
          ],
          ...whereObject
        }
      })

      await Promise.all([postsWithTags, postIds])
      postIds = await postIds
      postsWithTags = await postsWithTags
      let onlyPostIds: string[] = postIds.map((elem) => elem.id)
      if (postsWithTags.length > 0) {
        const postIdsWithDates = new Map<string, Date>()
        for (const post of postIds) {
          postIdsWithDates.set(post.id, post.createdAt)
        }
        for (const tagPost of postsWithTags) {
          if (!postIdsWithDates.has(tagPost.postId)) {
            postIdsWithDates.set(tagPost.postId, tagPost.post.createdAt)
          }
        }
        onlyPostIds = [...postIdsWithDates.entries()]
          .sort((a, b) => b[1].getTime() - a[1].getTime())
          .slice(0, POSTS_PER_PAGE)
          .map(([postId]) => postId)
      }

      res.send(await getUnjointedPosts(onlyPostIds, posterId))
    }
  )
}
