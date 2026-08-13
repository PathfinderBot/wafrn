import { Blocks, Post, User } from '../../models/index.js'
import { activityPubObject } from '../../interfaces/fediverse/activityPubObject.js'
import { deletePostCommon } from '../../services/deletePost.js'
import { logger } from '../../utils/logger.js'
import { redisCache } from '../../utils/redis.js'
import { removeUser } from '../../activitypub/removeUser.js'
import { signAndAccept } from '../../activitypub/signAndAccept.js'

async function DeleteActivity(body: activityPubObject, remoteUser: User, user: User) {
  // TODO ????
  const apObject: activityPubObject = body.object.type ? body.object : body
  // TODO divide in files
  try {
    if (typeof apObject.object === 'string') {
      // we assume its just the url of an user
      await removeUser(apObject.object)
      // await signAndAccept({ body: body }, remoteUser, user)
      return
    } else {
      switch (apObject.type) {
        case 'Tombstone': {
          const postToDelete = await Post.findOne({
            where: {
              remotePostId: apObject.id
            }
          })
          if (postToDelete) {
            await deletePostCommon(postToDelete.id)
          }
          // await signAndAccept({ body: body }, remoteUser, user)
          break
        }
        default: {
          logger.info({ message: `DELETE NOT IMPLEMENTED`, apObject })
        }
      }
    }
  } catch (error) {
    logger.trace({
      message: 'error with delete petition',
      error: error,
      petition: body
    })
  }
}

export { DeleteActivity }
