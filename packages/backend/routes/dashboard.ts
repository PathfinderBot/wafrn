// This file will use the new and improved api that returns more stuff
// it does more queries but it should be more efficient
// the MONSTER QUERY we are using now doesnt scale well on threads with lots of users

import { Application, Response } from 'express'
import optionalAuthentication from '../utils/optionalAuthentication.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import {
  FederatedHost,
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
import { getUnjointedPosts } from '../utils/baseQueryNew.js'
import { getMutedPosts } from '../utils/cacheGetters/getMutedPosts.js'
import { navigationRateLimiter } from '../utils/rateLimiters.js'
import { Privacy } from '../models/post.js'
import { getFollowedHashtags } from '../utils/getFollowedHashtags.js'
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
      const dbOptiondisableReplies = await UserOptions.findOne({
        where: {
          userId: posterId,
          optionName: 'wafrn.disableReplies'
        }
      })

      const disableReplies = dbOptiondisableReplies?.optionValue === 'true'
      const disableRepliesOr = [
        {
          isReblog: true
        },
        {
          parentId: null
        }
      ]

      switch (level) {
        case 2: {
          let hideReblogs = false
          const dbOptiondisableRewootsExploreLocal = await UserOptions.findOne({
            where: {
              userId: posterId,
              optionName: 'wafrn.disableRewootsExploreLocal'
            }
          })

          if (dbOptiondisableRewootsExploreLocal?.optionValue === 'true') {
            hideReblogs = true
          }
          const followedUsers = getFollowedsIds(posterId, true)
          const nonFollowedUsers = getNonFollowedLocalUsersIds(posterId)

          const and: any = [
            {
              [Op.or]: [
                {
                  privacy: {
                    [Op.in]: [Privacy.Public, Privacy.FollowersOnly, Privacy.LocalOnly]
                  },
                  userId: {
                    [Op.in]: await followedUsers
                  }
                },
                {
                  privacy: {
                    [Op.in]: req.jwtData?.userId ? [Privacy.Public, Privacy.LocalOnly] : [Privacy.Public] // only display public if not logged in
                  },
                  userId: {
                    [Op.in]: await nonFollowedUsers
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

          if (disableReplies) {
            and.push({
              [Op.or]: disableRepliesOr
            })
          }

          whereObject = {
            [Op.and]: and,
            isReblog: {
              [Op.in]: hideReblogs ? [false, null] : [true, false, null]
            }
          }

          break
        }
        case 1: {
          const user = await User.findByPk(posterId)
          if (completeEnvironment.enableBsky && user && user.enableBsky && user.bskyDid) {
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
              userId: { [Op.in]: await getFollowedsIds(posterId) }
            }
          ]

          const dbOptionDisableRewootsDashboard = await UserOptions.findOne({
            where: {
              userId: posterId,
              optionName: 'wafrn.disableRewootsDashboard'
            }
          })

          const hideReblogs = dbOptionDisableRewootsDashboard?.optionValue === 'true'
          const subscribedTags = await getFollowedHashtags(posterId)

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

          if (disableReplies) {
            and.push({
              [Op.or]: disableRepliesOr
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

          if (disableReplies)
            whereObject.parentId = null

          break
        }
        case 10: {
          // we get the list of posts twice woopsie. Should fix but this way is not going to be "that much"
          const dms = await PostMentionsUserRelation.findAll({
            order: [['createdAt', 'DESC']],
            limit: POSTS_PER_PAGE,
            where: {
              userId: posterId,
              createdAt: { [Op.lt]: getStartScrollParam(req) }
            }
          })

          const lastDmDate: Date = dms.length > 0 ? new Date(dms[dms.length - 1].createdAt) : new Date(0)
          const myPosts = await Post.findAll({
            // TODO fix this! there is a THEORETICAL posibility of something going wrong. using all user dms can be too much but just get them between here and last post...
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
          // bookmarked posts
          whereObject = {
            literal: sequelize.literal(
              `"posts"."id" IN (SELECT "postId" FROM "userBookmarkedPosts" WHERE "userId"='${posterId}')`
            )
          }
        }
      }
      // we get the list of posts
      let postIds: Post[] | Promise<Post[]> = Post.findAll({
        include: [
          {
            model: User,
            as: 'user',
            required: true,
            include: [
              {
                model: FederatedHost,
                required: false
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
        where: {
          createdAt: { [Op.lt]: getStartScrollParam(req) },
          ...whereObject,
        }
      })

      await Promise.all([postsWithTags, postIds])
      postIds = await postIds
      postsWithTags = await postsWithTags
      let onlyPostIds: string[] = postIds.map((elem) => elem.id)
      if (postsWithTags.length > 0) {
        let postIdsWithDates: Set<{ postId: string; date: Date }> = new Set()
        for (let post of postIds) {
          postIdsWithDates.add({ postId: post.id, date: post.createdAt })
        }
        for (let tagPost of postsWithTags) {
          postIdsWithDates.add({ postId: tagPost.postId, date: tagPost.post.createdAt })
        }
        onlyPostIds = [...postIdsWithDates]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, POSTS_PER_PAGE)
          .map((elem) => elem.postId)
      }

      res.send(await getUnjointedPosts(onlyPostIds, posterId))
    }
  )
}
