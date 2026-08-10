import { Application, Response } from 'express'
import { Op, QueryTypes } from 'sequelize'
import {
  Blocks,
  Post,
  PostMentionsUserRelation,
  PostReport,
  PostTag,
  User,
  Follows,
  Media,
  Ask,
  Notification
} from '../models/index.js'
import { authenticateToken } from '../utils/authenticateToken.js'
import { sequelize } from '../models/index.js'
import getStartScrollParam from '../utils/getStartScrollParam.js'
import { logger } from '../utils/logger.js'
import { createPostLimiter, navigationRateLimiter } from '../utils/rateLimiters.js'
import AuthorizedRequest from '../interfaces/authorizedRequest.js'
import optionalAuthentication from '../utils/optionalAuthentication.js'
import { getPetitionSigned } from '../activitypub/getPetitionSigned.js'
import { getPostThreadRecursive } from '../activitypub/getPostThreadRecursive.js'
import { canInteract, getUnjointedPosts } from '../services/baseQueryNew.js'
import { federatePostHasBeenEdited } from '../activitypub/editPost.js'
import { getAvaiableEmojisUncached } from '../utils/getAvaiableEmojisUncached.js'
import { redisCache } from '../utils/redis.js'
import { getUserOptions } from '../utils/cacheGetters/getUserOptions.js'
import showdown from 'showdown'
import { forceUpdateLastActive } from '../utils/forceUpdateLastActive.js'
import { bulkCreateNotifications, createNotification } from '../services/pushNotifications.js'
import dompurify from 'isomorphic-dompurify'
import { InteractionControl, Privacy, PrivacyType, requiresManualApproval } from '../models/post.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { addHandlePrefix } from '../models/user.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { processSinglePost } from '../atproto/utils/getAtProtoThread.js'
import { getFlowProducer, getQueue } from '../utils/queues.js'
import { filterLanguageCode } from '../utils/languages.js'

const markdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  strikethrough: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  emoji: true,
  encodeEmails: false
})
const prepareSendPostQueue = getQueue('prepareSendPost')
const sendPostBskyQueue = getQueue('sendPostBsky')

export default function postsRoutes(app: Application) {
  app.get(
    '/api/article/:user?/:slug',
    optionalAuthentication,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      const userUrl = req.params?.user
      const postSlug = req.params?.slug
      const user = userUrl
        ? await User.findOne({
            where: sequelize.where(sequelize.fn('lower', sequelize.col('url')), userUrl.toLowerCase())
          })
        : await getAdminUser()
      if (!user) {
        res.sendStatus(404)
      } else {
        const postFound = await Post.findOne({
          where: sequelize.and(
            sequelize.where(sequelize.fn('lower', sequelize.col('slug')), postSlug.toLowerCase()),
            sequelize.where(sequelize.col('userId'), user.id)
          )
        })
        if (postFound) {
          res.redirect('/api/v2/post/' + postFound.id)
        } else {
          res.sendStatus(404)
        }
      }
    }
  )
  app.get(
    '/api/v2/post/:id',
    optionalAuthentication,
    navigationRateLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      try {
        const userId = req.jwtData?.userId
        const postId = req.params?.id
        if (!postId) {
          return res.status(400).send({ success: false, message: 'No post id received' })
        }

        const unjointedPost = await getUnjointedPosts(
          [postId],
          userId ? userId : '00000000-0000-0000-0000-000000000000',
          true
        )
        const post = unjointedPost.posts[0]
        if (!post) {
          return res.status(404).send({ success: false, message: 'Post not found' })
        }

        const mentions = unjointedPost.mentions.map((elem: any) => elem.userMentioned)
        const userCanSeePost =
          post.userId === userId || mentions.includes(userId) || post.privacy !== Privacy.DirectMessage

        if (!userCanSeePost) {
          return res.status(403).send({
            success: false,
            message: 'You are not authorized to read this post'
          })
        }

        return res.send(unjointedPost)
      } catch (err) {
        logger.error(err)
        return res.status(500).send({ success: false, message: 'Internal server error' })
      }
    }
  )

  app.get('/api/v2/blog', optionalAuthentication, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    const id = req.query.id as string
    const featured = req.query.featured == 'true'
    const mediaOnly = req.query.mediaOnly == 'true'

    if (id) {
      const blog = await User.findOne({
        where: {
          [Op.or]: [sequelize.where(sequelize.fn('lower', sequelize.col('url')), id.toLowerCase()), { bskyDid: id }]
        }
      })

      if (!blog) {
        res.sendStatus(404)
        return
      }

      if (blog.isRemoteUser && !req.jwtData?.userId) {
        // require auth to see external user blog
        return res.sendStatus(403)
      }
      const blogId = blog?.id
      if (blogId) {
        const privacyArray: PrivacyType[] = [Privacy.Public, Privacy.LocalOnly, Privacy.Unlisted]
        if (
          req.jwtData?.userId === blogId ||
          (req.jwtData?.userId &&
            (await Follows.count({
              where: {
                followedId: blogId,
                followerId: req.jwtData?.userId,
                accepted: true
              }
            })))
        ) {
          privacyArray.push(Privacy.FollowersOnly)
        }
        let queryObject: any = {
          order: [['createdAt', 'DESC']],
          limit: featured ? undefined : completeEnvironment.postsPerPage,
          attributes: ['id', 'createdAt', 'featured'],
          where: {
            createdAt: { [Op.lt]: getStartScrollParam(req) },
            [Op.and]: [
              {
                featured: featured
                  ? {
                      [Op.ne]: null
                    }
                  : {
                      [Op.or]: [
                        {
                          [Op.ne]: null
                        },
                        { [Op.eq]: null }
                      ]
                    }
              },
              {
                [Op.or]: [
                  { waitToSendPost: { [Op.ne]: true } },
                  { userId: req.jwtData?.userId || '00000000-0000-0000-0000-000000000000' }
                ]
              }
            ],
            userId: blogId,
            privacy: {
              [Op.in]: privacyArray
            }
          }
        }
        if (mediaOnly) {
          queryObject = {
            include: [{ model: Media, required: true }],
            ...queryObject
          }
        }
        const postIds = await Post.findAll(queryObject)
        const postsByBlog = await getUnjointedPosts(
          postIds.map((post: any) => post.id),
          req.jwtData?.userId ? req.jwtData.userId : '00000000-0000-0000-0000-000000000000',
          true
        )
        success = true
        res.send(postsByBlog)
      }
    }

    if (!success) {
      res.send({ success: false })
    }
  })
  app.post(
    '/api/v3/createPost',
    authenticateToken,
    forceUpdateLastActive,
    createPostLimiter,
    async (req: AuthorizedRequest, res: Response) => {
      let success = false
      let mentionsToAdd: string[] = []
      const posterId = req.jwtData?.userId ? req.jwtData.userId : completeEnvironment.deletedUser
      const posterUser = await User.findByPk(posterId)
      if (!posterUser) {
        res.status(400).send({ message: 'Invalid poster user', success: false })
        return
      }

      const postToBeQuoted = await Post.findByPk(req.body.postToQuote)
      try {
        const parent = await Post.findByPk(req.body.parent)
        if (!parent && req.body.parent) {
          success = false
          res.status(500)
          res.send({ success: false, message: 'non existent parent' })
          return false
        }

        // we check if this is in reply to bsky if user does not have bsky enabled
        if (!posterUser?.enableBsky && parent && !posterUser?.bskyDid) {
          if (parent.bskyUri && !parent.remotePostId) {
            const parentPoster = await User.findByPk(parent.userId)
            if (parentPoster?.isRemoteUser && !parentPoster?.remoteId) {
              return res.status(400).send({
                success: false,
                message: 'You need to enable bluesky'
              })
            } else {
              const sqlQuery = `
WITH RECURSIVE ancestors AS (
  SELECT id, "parentId" FROM posts WHERE id = :parentId
  UNION ALL
  SELECT p.id, p."parentId"
  FROM posts p
  INNER JOIN ancestors a ON p.id = a."parentId"
)
SELECT DISTINCT id as "ancestorId" FROM ancestors WHERE id != '${parent.id}'
  `
              // we do same check for all parents
              const ancestorIdsQuery = await sequelize.query(sqlQuery, {
                replacements: {
                  parentId: parent.id
                }
              })
              const ancestorIds: string[] = ancestorIdsQuery[0].map((elem: any) => elem.ancestorId)
              if (ancestorIds.length > 0) {
                const ancestors = await Post.findAll({
                  include: [
                    {
                      model: User,
                      as: 'user',
                      attributes: ['url']
                    }
                  ],
                  where: {
                    id: {
                      [Op.in]: ancestorIds
                    }
                  }
                })
                const parentsUser = ancestors.map((elem) => elem.user)
                if (parentsUser.some((elem) => elem.isBlueskyUser && !elem.remoteId)) {
                  return res.status(400).send({
                    success: false,
                    message: 'You need to enable bluesky'
                  })
                }
              }
            }
          }
        }

        // we get the privacy of the parent and quoted post. Set body privacy to the max one
        const parentPrivacy: PrivacyType = parent ? parent.privacy : Privacy.Public
        let bodyPrivacy: PrivacyType = req.body.privacy ? req.body.privacy : Privacy.Public
        const quotedPostPrivacy: PrivacyType = postToBeQuoted ? postToBeQuoted.privacy : Privacy.Public

        if (!Object.values(Privacy).includes(bodyPrivacy)) {
          res.status(400).send({ success: false, message: 'invalid privacy setting' })
          return false
        }

        bodyPrivacy = getMaxPrivacy([bodyPrivacy, parentPrivacy, quotedPostPrivacy])

        // we check that the user is not reblogging a post by someone who blocked them or the other way arround
        if (parent) {
          // we check to add user mention if bsky id
          const ancestors = await sequelize.query(
            `
  WITH RECURSIVE ancestors AS (
    SELECT id, "parentId", "hierarchyLevel", "userId", "bskyUri"
    FROM posts
    WHERE id = :parentId
    UNION ALL
    SELECT p.id, p."parentId", p."hierarchyLevel", p."userId", p."bskyUri"
    FROM posts p
    INNER JOIN ancestors a ON p.id = a."parentId"
  )
  SELECT "userId"
  FROM ancestors
  WHERE "bskyUri" IS NOT NULL
    AND "hierarchyLevel" > :minLevel
  ORDER BY "hierarchyLevel" DESC
  `,
            {
              replacements: {
                parentId: parent.id,
                minLevel: parent.hierarchyLevel - 3
              },
              type: QueryTypes.SELECT
            }
          )

          if (req.body.content != '') {
            mentionsToAdd = mentionsToAdd.concat(ancestors.map((elem: any) => elem.userId))
            if (parent.bskyUri && parent.userId != posterId) {
              mentionsToAdd.push(parent.userId)
            }
          }

          const postParentsUsers: string[] = (await parent.getAncestors()).map((elem: any) => elem.userId)
          postParentsUsers.push(parent.userId)

          // we then check if the user has threads federation enabled and if not we check that no threads user is in the thread
          const options = await getUserOptions(posterId)
          const userFederatesWithThreads = options.filter(
            (elem) => elem.optionName === 'wafrn.federateWithThreads' && elem.optionValue === 'true'
          )
          if (userFederatesWithThreads.length === 0) {
            const ancestorPostsUsers = await User.findAll({
              where: {
                id: {
                  [Op.in]: postParentsUsers
                }
              }
            })
            const ancestorUrls: string[] = ancestorPostsUsers.map((elem: any) => elem.url.toLowerCase())
            if (ancestorUrls.some((elem) => elem.endsWith('.threads.net'))) {
              success = false
              res.status(403)
              res.send({
                success: false,
                message: 'You do not federate with threads and this thread contains a post from threads'
              })
              return false
            }
          }

          const bannedUsers = await User.count({
            where: {
              id: {
                [Op.in]: postParentsUsers
              },
              banned: true
            }
          })
          // only count on reblogs
          const blocksExistingOnParents = parent
            ? await Blocks.count({
                where: {
                  [Op.or]: [
                    {
                      blockerId: posterId,
                      blockedId: parent.userId
                    },
                    {
                      blockedId: posterId,
                      blockerId: parent.userId
                    }
                  ]
                }
              })
            : 0

          if (bannedUsers > 0) {
            success = false
            res.status(403).send({
              success: false,
              message: 'You have no permission to reply or reblog this post because of banned users'
            })
            return false
          }
          if (blocksExistingOnParents > 0) {
            success = false
            res.status(403).send({
              success: false,
              message: 'You have no permission to reply or reblog this post because of blocks'
            })
            return false
          }
        }

        let content = (req.body.content ? ' ' + req.body.content.trim() : '').substring(0, 2 * 1024 * 1024)
        const content_warning = req.body.content_warning.substring(0, 2 * 1024)
          ? req.body.content_warning.trim()
          : posterUser?.NSFW
            ? 'This user has been marked as NSFW and the post has been labeled automatically as NSFW'
            : ''
        let mediaToAdd: any[] = []
        const avaiableEmojis = await getAvaiableEmojisUncached()
        // we parse the content and we search emojis:
        const emojisToAdd = avaiableEmojis?.filter((emoji: any) => req.body.content.includes(emoji.name))

        if (req.body.medias && req.body.medias.length) {
          mediaToAdd = req.body.medias
          Media.findAll({
            where: {
              id: {
                [Op.in]: mediaToAdd.map((media: any) => media.id)
              },
              userId: posterId
            }
          }).then((mediasToUpdate) => {
            mediaToAdd.forEach(async (media, index) => {
              const mediaToUpdate = mediasToUpdate.find((el: any) => el.id === media.id)
              if (mediaToUpdate) {
                mediaToUpdate.mediaOrder = index
                mediaToUpdate.description = media.description
                mediaToUpdate.NSFW = media.NSFW
                // POSSIBLE PERFORMANCE IMPROVEMENT: do all saves at the same time. convert this foreach into a for each
                await mediaToUpdate.save()
              }
            })
          })
        }

        const mentionRegex = /\s@[\w-\.]+@?[\w-\.]*/gm
        let mentionsInPost: string[] | null = content.match(mentionRegex)
        if (!mentionsInPost) {
          mentionsInPost = ['']
        }
        content = content.replaceAll(mentionRegex, (userUrl: string) => userUrl.toLowerCase())

        let dbFoundMentions: User[] = []
        const newMentionedUsers = req.body.mentionedUserIds || req.body.mentionedUsersIds || []
        if (postToBeQuoted) {
          newMentionedUsers.push(postToBeQuoted.userId)
        }
        if (mentionsInPost?.length || newMentionedUsers.length) {
          const urlsToSearch = mentionsInPost.map((elem) => {
            // local users are stored without the @, so remove it from the query param
            let urlToSearch = elem.trim()
            if (urlToSearch.split('@').length == 2 && urlToSearch.split('.').length == 1) {
              urlToSearch = urlToSearch.split('@')[1]
            }
            // we sanitize the possible urls so we can use a literal
            return sequelize.escape(urlToSearch.toLowerCase().trim())
          })
          dbFoundMentions = await User.findAll({
            where: {
              [Op.or]: [
                sequelize.literal(`lower("url") IN (${urlsToSearch.join(',')})`),
                {
                  id: {
                    [Op.in]: newMentionedUsers
                  }
                }
              ]
            }
          })
        }

        if (dbFoundMentions.length > 0) {
          mentionsToAdd = mentionsToAdd.concat(dbFoundMentions.map((usr) => usr.id))

          // we check if user federates with threads and if not we check they are not mentioning anyone from threads
          const options = await getUserOptions(posterId)
          const userFederatesWithThreads = options.filter(
            (elem) => elem.optionName === 'wafrn.federateWithThreads' && elem.optionValue === 'true'
          )
          if (userFederatesWithThreads.length === 0) {
            if (dbFoundMentions.some((usr) => usr.url.toLowerCase().endsWith('.threads.net'))) {
              success = false
              res.status(403)
              res.send({
                success: false,
                message: 'You do not federate with threads and this thread contains a post from threads'
              })
              return false
            }
          }
          const blocksExisting = await Blocks.count({
            where: {
              [Op.or]: [
                {
                  blockerId: posterId,
                  blockedId: { [Op.in]: mentionsToAdd }
                },
                {
                  blockedId: posterId,
                  blockerId: { [Op.in]: mentionsToAdd }
                }
              ]
            }
          })
          // TODO fix this
          const blocksServers = 0 /*await ServerBlock.count({
          where: {
            userBlockerId: posterId,
            literal: Sequelize.literal(
              `blockedServerId IN (SELECT federatedHostId from users where id IN (${  mentionsToAdd.map(
                (elem) => '"' + elem + '"'
              )}))`
            )
          }
        })*/
          if (blocksExisting + blocksServers > 0) {
            res.status(403)
            res.send({
              error: true,
              message: 'You can not mention an user that you have blocked or has blocked you'
            })
            return null
          }

          const sortedMentions = dbFoundMentions.sort((a, b) => a.url.length - b.url.length)
          for (let userMentioned of sortedMentions) {
            const url = userMentioned.longHandle
            const remoteId = userMentioned.fullFediverseUrl
            let remoteUrl = userMentioned.remoteMentionUrl ? userMentioned.remoteMentionUrl : remoteId
            if (userMentioned.url.startsWith('@') && !remoteUrl && userMentioned.bskyDid) {
              remoteUrl = 'https://bsky.app/profile/' + userMentioned.bskyDid
            }
            const stringToReplace = addHandlePrefix(userMentioned.url.toLowerCase())
            const targetString = `<span class="h-card" translate="no"><a href="${remoteUrl}" class="u-url mention">@<span>${url}</span></a></span>`
            content = content.replace(`${stringToReplace}`, `${targetString}`).trim()
          }
        }

        content = markdownConverter.makeHtml(content.trim())
        let post: Post & Record<string, any> // this makes autocomplete work for Post fields but not freak out for methods it cannot find. better than `any`
        let previousPrivacy: PrivacyType = Privacy.Public
        content = content.trim()
        if (req.body.idPostToEdit) {
          const foundPost = await Post.findByPk(req.body.idPostToEdit)
          if (!foundPost) {
            return res.status(404).send({ message: 'Invalid post for edition', success: false })
          }
          if (foundPost.userId !== posterId) {
            return res.status(403).send({ message: 'You can only edit your own posts', success: false })
          }
          post = foundPost!
          previousPrivacy = foundPost!.privacy
          // reset timestamps when publishing a draft
          if (post.privacy === Privacy.Draft && bodyPrivacy !== Privacy.Draft) {
            post.createdAt = new Date()
            post.updatedAt = new Date()
          }

          post.content = content
          post.markdownContent = req.body.content.substring(0, 2 * 1024 * 1024)
          post.content_warning = content_warning
          post.privacy = bodyPrivacy
          post.language = filterLanguageCode(req.body.language)
          await post.save()
        } else {
          if (req.body.parent) {
            await redisCache.del('postAndUser:' + req.body.parent)
          }
          const isReblog = !!(
            parent &&
            content == '' &&
            !postToBeQuoted &&
            !req.body.ask &&
            mediaToAdd.length === 0 &&
            mentionsToAdd.length === 0 &&
            (req.body.tags ? req.body.tags.trim : '') == ''
          )
          let manualApprovalPending = false
          // a top-level parent (nothing above it in the thread) has no rootId of its own - it IS the root,
          // so fall back to it directly instead of looking up a rootId that doesn't exist
          const initialPost = parent ? (parent.rootId ? await Post.findByPk(parent.rootId) : parent) : undefined
          if (parent) {
            const control = isReblog ? parent.reblogControl : parent.replyControl
            if (!(await canInteract(control, posterId, parent.id))) {
              res.status(403)
              return res.send({
                success: false,
                message: `This post has interaction controls and you do not have permisions to ${isReblog ? 'reblog' : 'reply to'} it`
              })
            }

            const policyPost =
              !isReblog && control === InteractionControl.SameAsOp && initialPost ? initialPost : parent
            const effectiveControl = isReblog ? parent.reblogControl : policyPost.replyControl
            if (requiresManualApproval(effectiveControl) && policyPost.userId !== posterId) {
              const parentMentions = isReblog ? [] : await parent.getMentionPost()
              const posterIsMentionedByParent = parentMentions.some((mentioned: any) => mentioned.id === posterId)
              manualApprovalPending = !posterIsMentionedByParent
            }
          }
          if (postToBeQuoted) {
            if (!(await canInteract(postToBeQuoted.quoteControl, posterId, postToBeQuoted.id))) {
              res.status(403)
              return res.send({
                success: false,
                message: `This post has interaction controls and you do not have permisions to quote it`
              })
            }
          }
          let canReply = req.body.canReply ? req.body.canReply : InteractionControl.Anyone
          if (initialPost && initialPost.replyControl != InteractionControl.Anyone) {
            canReply = InteractionControl.SameAsOp
          }
          post = await Post.create({
            content,
            content_warning,
            userId: posterId,
            privacy: bodyPrivacy,
            parentId: req.body.parent,
            markdownContent: req.body.content.substring(0, 2 * 1024 * 1024),
            isReblog: isReblog,
            replyControl: canReply || InteractionControl.Anyone,
            quoteControl: req.body.canBeQuoted || InteractionControl.Anyone,
            likeControl: req.body.canLike || InteractionControl.Anyone,
            isReply: parent ? parent.isReply || parent.userId != posterId : false,
            isBskyExclusive: parent ? parent.isBskyExclusive : false,
            language: filterLanguageCode(req.body.language),
            waitToSendPost: manualApprovalPending
          })
        }

        if (post.isReblog) {
          await createNotification(
            {
              notificationType: 'REWOOT',
              notifiedUserId: parent?.userId as string,
              userId: post.userId,
              postId: parent?.id,
              detached: false
            },
            {
              postContent: parent?.content,
              userUrl: posterUser?.url
            }
          )
        }
        if (postToBeQuoted) {
          if (req.body.idPostToEdit) {
            await Notification.destroy({
              where: {
                notificationType: 'QUOTE',
                notifiedUserId: postToBeQuoted.userId,
                userId: post.userId,
                postId: post.id
              }
            })
          }
          await post.addQuoted(postToBeQuoted)
          await PostMentionsUserRelation.findOrCreate({
            where: {
              postId: post.id,
              userId: postToBeQuoted.userId
            }
          })

          // dont create quote notification for drafts
          if (post.privacy !== Privacy.Draft) {
            await createNotification(
              {
                notificationType: 'QUOTE',
                notifiedUserId: postToBeQuoted.userId,
                userId: post.userId,
                postId: post.id,
                createdAt: new Date(postToBeQuoted.createdAt),
                detached: false
              },
              {
                postContent: post.content,
                userUrl: posterUser?.url
              }
            )
          }
        }

        const askId = req.body.ask
        // dont mark asks as answered for drafts
        if (askId && post.privacy !== Privacy.Draft) {
          const ask = await Ask.findOne({
            where: {
              id: parseInt(askId),
              userAsked: posterId
            }
          })
          if (ask) {
            ask.answered = true
            ask.postId = post.id
            if (ask.userAsker && !mentionsToAdd.includes(ask.userAsker)) {
              mentionsToAdd.push(ask.userAsker)
            }
            await ask.save()
          }
        }
        mentionsToAdd = [...new Set(mentionsToAdd)].filter((elem) => elem != posterId)
        await post.setMedias(mediaToAdd.map((media: any) => media.id))
        await post.setMentionPost(mentionsToAdd)
        if (req.body.idPostToEdit) {
          await Notification.destroy({
            where: {
              notificationType: 'MENTION',
              postId: post.id
            }
          })
        }
        if (post.privacy !== Privacy.Draft) {
          await bulkCreateNotifications(
            mentionsToAdd.map((mention) => ({
              notificationType: 'MENTION',
              notifiedUserId: mention,
              userId: post.userId,
              postId: post.id,
              createdAt: new Date(post.createdAt),
              detached: false
            })),
            {
              postContent: post.content,
              userUrl: posterUser?.url
            }
          )
        }

        post.setEmojis(emojisToAdd)
        const inlineTags = Array.from(
          dompurify.sanitize(post.content, { ALLOWED_TAGS: [] }).matchAll(/#[a-zA-Z0-9_]+/gi)
        )
          .join(',')
          .replaceAll('#', '')
        const bodyTags = req.body.tags ? req.body.tags + ',' + inlineTags : inlineTags
        success = !bodyTags
        if (bodyTags) {
          const tagListString = bodyTags
          let tagList: string[] = tagListString.split(',').filter((elem) => elem.length > 0)
          tagList = tagList.map((s: string) => s.trim())
          await PostTag.destroy({
            where: {
              postId: post.id
            }
          })
          await PostTag.bulkCreate(
            tagList.map((tag) => {
              return {
                tagName: tag,
                postId: post.id
              }
            })
          )

          success = true
        }
        res.send(post)
        await post.save()

        // do not federate for local-only or drafts
        if (+post.privacy !== Privacy.LocalOnly && post.privacy !== Privacy.Draft) {
          if (req.body.idPostToEdit) {
            if (previousPrivacy === Privacy.LocalOnly || previousPrivacy === Privacy.Draft) {
              await triggerPostFederation(post, posterUser!)
            } else {
              await federatePostHasBeenEdited(post)
            }
          } else {
            await triggerPostFederation(post, posterUser!)
          }
        }
      } catch (error) {
        logger.error(error)
      }
      if (!success) {
        res.statusCode = 400
        logger.debug({
          message: `Failed to create post`,
          body: req.body
        })
        res.send({ success: false })
      }
    }
  )

  app.post('/api/refederatePost', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    const user = (await User.findByPk(req.jwtData?.userId as string)) as User
    const post = await Post.findOne({
      where: {
        userId: user.id,
        id: req.body.postId as string
      }
    })
    if (post) {
      const medias = await Media.findAll({
        where: {
          postId: post.id
        }
      })
      if (medias.length) {
        // We force update the media metadata because of posibility of it not having height and width metadata
        const updateMediaDataQueue = getQueue('processRemoteMediaData')
        await updateMediaDataQueue.addBulk(
          medias.map((media: any) => {
            return {
              name: `getMediaData${media.id}`,
              data: { mediaId: media.id }
            }
          })
        )
      }
      triggerPostFederation(post, user)
      success = true
    }
    res.send({
      success
    })
  })

  app.post('/api/reportPost', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    let success = false
    let report
    try {
      const posterId = req.jwtData?.userId
      if ((req.body.userId || req.body?.postId) && req.body.severity && req.body.description) {
        report = await PostReport.create({
          resolved: false,
          severity: req.body.severity,
          description: req.body.description,
          userId: posterId,
          postId: req.body.postId,
          reportedUserId: req.body.userId ? req.body.userId : undefined
        })
        success = true
        res.send(report)
      }
    } catch (error) {
      logger.error(error)
    }
    if (!success) {
      res.send({
        success: false
      })
    }
  })

  app.get('/api/loadRemoteResponses', authenticateToken, async (req: AuthorizedRequest, res: Response) => {
    try {
      const userId = req.jwtData?.userId as string
      const postToGetRepliesFromId = req.query.id as string
      let remotePostPromise = Post.findByPk(postToGetRepliesFromId)
      let userPromise = User.findByPk(userId)
      await Promise.all([userPromise, remotePostPromise])

      let user = await userPromise
      let remotePost = await remotePostPromise

      if (remotePost?.remotePostId && user) {
        // fedi post
        const postPetition = await getPetitionSigned(user, remotePost.remotePostId)
        if (postPetition) {
          if (postPetition.inReplyTo && remotePost.hierarchyLevel === 1) {
            const lostParent = await getPostThreadRecursive(user, postPetition.inReplyTo)
            if (lostParent) await remotePost.setParent(lostParent)
          }
          // next replies to process
          let next = postPetition.replies.first
          while (next) {
            const petitions = next.items.map((elem: any) => getPostThreadRecursive(user, elem.id ? elem.id : elem))
            await Promise.allSettled(petitions)
            next = next.next ? await getPetitionSigned(user, next.next) : undefined
          }
        }
      }
      if (remotePost?.bskyUri) {
        await processSinglePost(remotePost.bskyUri, true)
      }
    } catch (error) {
      logger.debug({
        message: 'error getting external responses',
        post: req.query.id,
        error: error
      })
    }
    res.send({})
  })
}

export const PRIVACY_ORDER = [
  Privacy.Public,
  Privacy.Unlisted,
  Privacy.FollowersOnly,
  Privacy.LocalOnly,
  Privacy.DirectMessage,
  Privacy.LinkOnly,
  Privacy.Draft
]

function getMaxPrivacy(privacies: PrivacyType[]) {
  const privacyOrders = privacies.map((p) => PRIVACY_ORDER.indexOf(p))
  const mostPrivateIndex = Math.max(...privacyOrders)
  const privacy = PRIVACY_ORDER[mostPrivateIndex]
  return privacy
}

async function triggerPostFederation(post: Post, user: User) {
  const jobData = { postId: post.id, petitionBy: post.userId }
  if (post.privacy === Privacy.Public && user.enableBsky && completeEnvironment.enableBsky && user.bskyDid) {
    sendPostBskyQueue.add('sendPostBsky', jobData)
  } else {
    prepareSendPostQueue.add('prepareSendPost', jobData, {
      jobId: post.id
    })
  }
}
