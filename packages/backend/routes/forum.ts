import optionalAuthentication from '../utils/optionalAuthentication.js'
import checkIpBlocked from '../utils/checkIpBlocked.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import { Application, Request, Response } from 'express'
import {
  Post,
  QuestionPoll,
  QuestionPollAnswer,
  QuestionPollQuestion,
  ServerBlock,
  User,
  UserOptions,
  sequelize
} from '../models/index.js'
import { Model, Op, QueryTypes } from 'sequelize'
import {
  addPostCanInteract,
  getBookmarks,
  getEmojis,
  getLikes,
  getMedias,
  getMentionedUserIds,
  getQuotes,
  getTags
} from '../utils/baseQueryNew.js'
import getFollowedsIds from '../utils/cacheGetters/getFollowedsIds.js'
import { Privacy } from '../models/post.js'
import { getallBlockedServers } from '../utils/cacheGetters/getAllBlockedServers.js'
import { completeEnvironment } from '../utils/backendOptions.js'

export default function forumRoutes(app: Application) {
  app.get('/api/forum/:id', optionalAuthentication, async (req: AuthorizedRequest, res: Response) => {
    const userId = req.jwtData?.userId ? req.jwtData.userId : '00000000-0000-0000-0000-000000000000'
    const postId = req.params?.id as string
    const postsToGet = await Post.findOne({
      where: {
        id: postId
      },
      attributes: ['id', 'hierarchyLevel']
    })
    if (postsToGet) {
      const query = `
    WITH RECURSIVE descendants AS (
      SELECT id FROM posts WHERE "parentId" = '${postsToGet.id}' AND "isDeleted" = false
      UNION ALL
      SELECT p.id FROM posts p
      INNER JOIN descendants d ON p."parentId" = d.id
      WHERE p."isDeleted" = false
    )
    SELECT DISTINCT id FROM descendants
    `
      let postIds = (
        await sequelize.query(
          query,
          {
            type: QueryTypes.SELECT
          }
        )
      ).map((elem: any) => elem.id)
      const fullPostsToGet = await Post.findAll({
        include: [
          {
            model: User,
            as: 'user',
            required: true,
            where: {
              banned: {
                [Op.ne]: true
              },
              [Op.or]: [
                {
                  [Op.and]: [
                    {
                      federatedHostId: {
                        [Op.notIn]: await getallBlockedServers()
                      }
                    },
                    {
                      federatedHostId: {
                        [Op.notIn]: (await ServerBlock.findAll({ where: { userBlockerId: userId } })).map(
                          (elem) => elem.blockedServerId
                        )
                      }
                    }
                  ]
                },
                {
                  federatedHostId: {
                    [Op.eq]: null
                  }
                }
              ]
            }
          }
        ],
        where: {
          detached: {
            [Op.ne]: true
          },
          id: {
            [Op.in]: [...new Set(postIds.concat([postId]))]
          },
          [Op.or]: [
            {
              userId: userId
            },
            {
              privacy: Privacy.FollowersOnly,
              userId: {
                [Op.in]: await getFollowedsIds(userId, false)
              }
            },
            {
              privacy: {
                [Op.in]: req.jwtData?.userId
                  ? [Privacy.Public, Privacy.LocalOnly, Privacy.Unlisted]
                  : [Privacy.Public, Privacy.LocalOnly]
              }
            }
          ]
        }
      })
      postIds = fullPostsToGet.map((elem) => elem.id)
      const quotes = await getQuotes(postIds)
      const quotedPostsIds = quotes.map((quote) => quote.quotedPostId)
      postIds = postIds.concat(quotedPostsIds)
      const quotedPosts = await Post.findAll({
        where: {
          id: {
            [Op.in]: quotedPostsIds
          }
        }
      })
      let userIds = fullPostsToGet.map((pst: any) => pst.userId)
      userIds = userIds.concat(quotedPosts.map((q: any) => q.userId))
      const emojis = getEmojis({
        userIds,
        postIds
      })
      const mentions = await getMentionedUserIds(postIds)
      userIds = userIds.concat(mentions.usersMentioned)
      userIds = userIds.concat((await emojis).postEmojiReactions.map((react: any) => react.userId))
      const polls = QuestionPoll.findAll({
        where: {
          postId: {
            [Op.in]: postIds
          }
        },
        include: [
          {
            model: QuestionPollQuestion,
            include: [
              {
                model: QuestionPollAnswer,
                required: false,
                where: {
                  userId: userId
                }
              }
            ]
          }
        ]
      })
      const medias = getMedias(postIds)
      const tags = getTags(postIds)
      const likes = await getLikes(postIds)
      userIds = userIds.concat(likes.map((like: any) => like.userId))
      const users = User.findAll({
        attributes: ['url', 'avatar', 'id', 'name', 'remoteId'],
        where: {
          id: {
            [Op.in]: userIds
          }
        },
        raw: true
      })
      let usersFollowedByPoster: string[] | Promise<string[]> = getFollowedsIds(userId)
      let usersFollowingPoster: string[] | Promise<string[]> = getFollowedsIds(userId, false, {
        getFollowersInstead: true
      })
      await Promise.all([emojis, users, polls, medias, tags, usersFollowedByPoster, usersFollowingPoster])
      usersFollowedByPoster = await usersFollowedByPoster
      usersFollowingPoster = await usersFollowingPoster
      const mentionsAwaited = await mentions
      const posts = await Promise.all(
        (await fullPostsToGet)
          .filter((elem: any) => elem.id !== postId)
          .map((elem) =>
            addPostCanInteract(userId, elem.dataValues, usersFollowingPoster, usersFollowedByPoster, mentionsAwaited)
          )
      )
      const fediAttachmentsDb = await UserOptions.findAll({
        where: {
          userId: {
            [Op.in]: userIds
          },
          optionName: 'fediverse.public.attachment'
        }
      })
      const usersPronounsMap: Map<string, string | undefined> = new Map()
      for (const att of fediAttachmentsDb) {
        const fediAttachments: { name: string; value: string }[] = JSON.parse(att.optionValue)
        const pronouns = fediAttachments.find((elem) => elem.name.toLowerCase() === 'pronouns')?.value
        if (!pronouns) continue
        usersPronounsMap.set(att.userId, pronouns)
      }
      res.send({
        posts: posts,
        emojiRelations: await emojis,
        mentions: mentions.postMentionRelation,
        users: (await users).map((x) => {
          const pronouns = usersPronounsMap.get(x.id)
          return {
            ...x,
            ...(pronouns
              ? {
                pronouns
              }
              : {})
          }
        }),
        polls: await polls,
        medias: await medias,
        tags: await tags,
        likes: likes,
        quotes: quotes,
        quotedPosts: await quotedPosts,
        bookmarks: await getBookmarks(postIds, userId)
      })
    } else {
      res.sendStatus(404)
    }
  })
}
