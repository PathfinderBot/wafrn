import { Op } from 'sequelize'
import {
  Bites,
  EmojiReaction,
  Media,
  Notification,
  Post,
  PostMentionsUserRelation,
  PostTag,
  Quotes,
  User,
  UserBitesPostRelation,
  UserLikesPostRelations
} from '../models/index.js'
import { getDeletedUser } from './cacheGetters/getDeletedUser.js'
import fs from 'fs/promises'

async function deletePostCommon(id: string) {
  const postToDelete = await Post.findByPk(id)
  
  if (postToDelete) {
    
    if (postToDelete.isReblog) {
      await Notification.destroy({
        where: {
          postId: postToDelete.parentId,
          userId: postToDelete.userId
        }
      })
    } else {
      // post is not a reblog we do extra stuff
      const reblogsDestroyed = await Post.destroy({
        where: {
          parentId: id,
          content: '',
          isReblog: true
        }
      })
      await Notification.destroy({
        where: {
          postId: id
        }
      })
      await Quotes.destroy({
      where: {
        [Op.or]: [
          {
            quotedPostId: id
          },
          {
            quoterPostId: id
          }
        ]
      }
    })
    const localMedias = await Media.findAll({
      where: {
        postId: id,
        external: false
      }
    })
    if(localMedias){
      localMedias.forEach(media => {
        try {
          const fileToDelete = "uploads" + media.url
          fs.unlink(fileToDelete).then(() => {});
        } catch (error) {

        }
      })
    }
    await Media.destroy({
      where: {
        postId: id
      }
    })

    await EmojiReaction.destroy({
      where: {
        postId: id
      }
    })
    await UserBitesPostRelation.destroy({
      where: {
        postId: id
      }
    })

    await PostTag.destroy({
      where: {
        postId: id
      }
    })
    await UserLikesPostRelations.destroy({
      where: {
        postId: id
      }
    })

    await PostMentionsUserRelation.destroy({
      where: {
        postId: id
      }
    })

    postToDelete.content_warning = ''
    postToDelete.content = '<p>This post has been deleted</p>'
    postToDelete.isDeleted = true
    const deletedUser = (await getDeletedUser()) as User
    postToDelete.userId = deletedUser.id
    await postToDelete.save()
    }
  }
}

export { deletePostCommon }
