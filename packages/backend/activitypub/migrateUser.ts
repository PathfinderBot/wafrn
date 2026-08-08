import { getQueue } from '../utils/queues.js'
import { Op } from 'sequelize'
import { isArray } from 'util'
import { activityPubObject } from '../interfaces/fediverse/activityPubObject.js'
import { Follows, User, UserOptions } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getPetitionSigned } from './getPetitionSigned.js'
import { sendUpdateProfile } from './sendUpdateProfile.js'
import { getRemoteActor } from './getRemoteActor.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { logger } from '../utils/logger.js'

async function migrateUserFedi(
  originUser: User,
  destinationUser: User
): Promise<{ success: boolean; message: string }> {
  const res = { success: false, message: 'Migration not started' }
  res.message = `User found but new account doesnt seems to have an alias pointing towards you`
  if (!destinationUser.url.startsWith('@')) {
    // migration of local users!
    res.message = `User is local but doesnt has the alsoknownas option`
    const destinationUserAliasOption = await UserOptions.findOne({
      where: {
        userId: destinationUser.id,
        optionName: 'fediverse.public.alsoKnownAs'
      }
    })
    if (destinationUserAliasOption && destinationUserAliasOption.optionValue) {
      const destinationUserAliasUser = await getRemoteActor(
        destinationUserAliasOption.optionValue,
        await getAdminUser()
      )
      if (destinationUserAliasUser && destinationUserAliasUser.id === originUser.id) {
        // migration is valid lets gooo
        await migrateInternal(
          originUser,
          `${completeEnvironment.frontendUrl}/fediverse/blog/${destinationUser.url.toLowerCase()}`
        )
        res.message = 'Local migration succeded'
        res.success = true
      } else {
        res.message = `Target user is local but alsoknownas points to: ${destinationUserAliasUser?.url} option: ${destinationUserAliasOption.optionValue}`
      }
    }
    return res
  }
  if (!destinationUser.remoteId) {
    throw new Error(`Destination user ${destinationUser.url} has no remoteId and is not local, hence is no fedi user`)
  }

  try {
    const localUser = originUser
    const newUserRemoteId = destinationUser.remoteId
    const petitionData = await getPetitionSigned(localUser, destinationUser.remoteId as string)
    if (petitionData && petitionData.alsoKnownAs) {
      const aliasList = isArray(petitionData.alsoKnownAs)
        ? petitionData.alsoKnownAs.map((elem: string) => elem.toLowerCase())
        : [petitionData.alsoKnownAs.toLowerCase()]
      if (aliasList.includes(`${completeEnvironment.frontendUrl}/fediverse/blog/${localUser.url}`.toLowerCase())) {
        await migrateInternal(localUser, newUserRemoteId)
        res.message = `Operation successful!`
        res.success = true
      } else {
        res.message = `Alias not detected`
      }
    }
  } catch (error) {
    logger.info({
      message: `Error migrating user`,
      error: error
    })
  }
  return res
}

async function migrateInternal(localUser: User, newUserRemoteId: string) {
  const deletePostQueue = getQueue('deletePostQueue')
  // TIME TO MOVE OUT
  // FIRST STEP: followers. send message to each follower. a move object
  const followerIds = await Follows.findAll({
    attributes: ['followerId'],
    where: {
      followedId: localUser.id
    }
  })
  const followers = await User.findAll({
    where: {
      id: {
        [Op.in]: followerIds.map((elem) => elem.followerId)
      }
    }
  })
  const moveObjectToSend: activityPubObject = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id:
      completeEnvironment.frontendUrl +
      '/fediverse/blogMove/' +
      localUser.url.toLowerCase() +
      '/' +
      new Date().getTime(),
    actor: completeEnvironment.frontendUrl + '/fediverse/blog/' + localUser.url.toLowerCase(),
    type: 'Move',
    object: completeEnvironment.frontendUrl + '/fediverse/blog/' + localUser.url.toLowerCase(),
    target: newUserRemoteId
  }
  for await (const remoteFollower of followers.filter((elem) => !!elem.remoteId)) {
    await deletePostQueue.add('sendChunk', {
      objectToSend: moveObjectToSend,
      petitionBy: localUser,
      inboxList: [remoteFollower.remoteInbox]
    })
  }

  // second step: local followers here: create a follow request to new account
  const localFollows = await User.findAll({
    where: {
      id: {
        [Op.in]: followerIds.map((elem) => elem.followerId)
      },
      email: {
        [Op.ne]: null
      }
    }
  })
  const followQueue = getQueue('doFollow')
  const newRemoteUser = await getRemoteActor(newUserRemoteId, await getAdminUser())
  if (newRemoteUser) {
    followQueue.addBulk(
      localFollows.map((follow: any) => {
        return {
          name: `follow${follow.url}-${newRemoteUser.url}`,
          data: { followerId: follow.id, followedId: newRemoteUser.id }
        }
      })
    )
  }
  // third step: return data and set message to succ ess
  localUser.userMigratedTo = newUserRemoteId
  await localUser.save()
  // fourth step: send update profile
  await sendUpdateProfile(localUser)
}

export { migrateUserFedi }
