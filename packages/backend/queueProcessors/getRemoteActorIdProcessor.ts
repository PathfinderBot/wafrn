import { Job } from 'bullmq'
import { FederatedHost, User, UserOptions, sequelize } from '../models/index.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import { getQueue } from '../utils/queues.js'
import { getPetitionSigned } from '../activitypub/getPetitionSigned.js'
import { processUserEmojis } from '../activitypub/processUserEmojis.js'
import { fediverseTag } from '../interfaces/fediverse/tags.js'
import { logger } from '../utils/logger.js'
import { redisCache } from '../utils/redis.js'
import { Op } from 'sequelize'
import { getDeletedUser } from '../utils/cacheGetters/getDeletedUser.js'
import processExternalCustomCss from '../services/processExternalCustomCss.js'
import { unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { getDidDoc } from '../atproto/utils/getDidDoc.js'
import getUserAgent from '../utils/getUserAgent.js'
import { getUserIdFromRemoteId } from '../utils/cacheGetters/getUserIdFromRemoteId.js'
import { getAdminUser } from '../utils/getAdminAndDeletedUser.js'
import { clearUserCache } from '../utils/clearUserCache.js'

const mergeUsersQueue = getQueue('mergeUsers')

// This function will return userid after processing it.
async function getRemoteActorIdProcessor(job: Job): Promise<string | null> {
  const actorUrl: string = job.data.actorUrl
  const forceUpdate: boolean = job.data.forceUpdate
  let res: string | User | undefined | null = await getUserIdFromRemoteId(actorUrl)
  let url = undefined
  try {
    url = new URL(actorUrl)
  } catch (error) {
    res = await getDeletedUser()
    url = undefined
    logger.debug({
      message: `Invalid url ${actorUrl}`,
      url: actorUrl,
      stack: new Error().stack
    })
  }
  if (res === '' || (forceUpdate && url != undefined)) {
    let federatedHost = await FederatedHost.findOne({
      where: sequelize.where(
        sequelize.fn('lower', sequelize.col('displayName')),
        url?.host ? url.host.toLowerCase() : ''
      )
    })
    const hostBanned = federatedHost?.blocked
    if (hostBanned) {
      res = await getDeletedUser()
    } else {
      const user = job.data.userId ? ((await User.findByPk(job.data.userId)) as User) : await getAdminUser()
      const userPetition = await getPetitionSigned(user, actorUrl)
      if (userPetition) {
        if (!federatedHost && url) {
          const federatedHostToCreate = {
            displayName: url.host.toLocaleLowerCase(),
            publicInbox: userPetition.endpoints?.sharedInbox ? userPetition.endpoints?.sharedInbox : ''
          }
          federatedHost = (await FederatedHost.findOrCreate({ where: federatedHostToCreate }))[0]
        }
        if (!url || !federatedHost) {
          logger.warn({
            message: 'Url is not valid wtf',
            trace: new Error().stack
          })
          return (await getDeletedUser()).id
        }
        const remoteMentionUrl = typeof userPetition.url === 'string' ? userPetition.url : ''
        let followers = 0
        let followed = 0
        if (userPetition.followers) {
          const followersPetition = await getPetitionSigned(user, userPetition.followers)
          if (followersPetition && followersPetition.totalItems) {
            followers = followersPetition.totalItems
          }
        }
        if (userPetition.following) {
          const followingPetition = await getPetitionSigned(user, userPetition.following)
          if (followingPetition && followingPetition.totalItems) {
            followed = followingPetition.totalItems
          }
        }
        const userData = {
          hideFollows: false,
          hideProfileNotLoggedIn: false,
          url: `@${userPetition.preferredUsername}@${url?.host}`,
          name: userPetition.name ? userPetition.name : userPetition.preferredUsername,
          email: null,
          description: userPetition.summary ? userPetition.summary : '',
          avatar: userPetition.icon?.url
            ? userPetition.icon.url
            : `${completeEnvironment.mediaUrl}/uploads/default.webp`,
          headerImage: userPetition?.image?.url ? userPetition.image.url.toString() : ``,
          password: 'NOT_A_WAFRN_USER_NOT_REAL_PASSWORD',
          publicKey: userPetition.publicKey?.publicKeyPem,
          remoteInbox: userPetition.inbox,
          remoteId: actorUrl,
          activated: true,
          federatedHostId: federatedHost.id,
          remoteMentionUrl: remoteMentionUrl,
          followersCollectionUrl: userPetition.followers,
          followingCollectionUrl: userPetition.following,
          isBot: userPetition.type != 'Person',
          followerCount: followers,
          followingCount: followed,
          createdAt: userPetition.published ? new Date(userPetition.published) : new Date(),
          updatedAt: new Date(),
          NSFW: false,
          birthDate: new Date(),
          userMigratedTo: userPetition.movedTo || '',
          displayUrl: Array.isArray(userPetition.url)
            ? userPetition.url[0].href || userPetition.url[0]
            : userPetition.url,
          manuallyAcceptsFollows: userPetition.manuallyApprovesFollowers ?? false
        }
        federatedHost.publicInbox = userPetition.endpoints?.sharedInbox || null
        await federatedHost.save()
        let userRes
        const existingUsers = await User.findAll({
          where: {
            [Op.or]: [
              sequelize.where(sequelize.fn('lower', sequelize.col('url')), userData.url.toLowerCase()),
              {
                remoteId: userData.remoteId
              }
            ]
          }
        })
        if (res) {
          if (res !== (await getDeletedUser())) {
            userRes = await User.findByPk(res as string)
            if (existingUsers.length > 1) {
              logger.debug({
                message: `Multiple fedi users found for ${userData.url} (${userData.remoteId}): ${existingUsers.length}`
              })
              for await (const userWithDuplicatedData of existingUsers.slice(1)) {
                userWithDuplicatedData.url = userWithDuplicatedData.url + '_DUPLICATED_' + new Date().getTime()
                userWithDuplicatedData.remoteId =
                  userWithDuplicatedData.remoteId + '_DUPLICATED_' + new Date().getTime()
              }
            }
            if (existingUsers && existingUsers.length > 0 && existingUsers[0] && userRes?.id !== existingUsers[0]?.id) {
              const existingUser = existingUsers[0]
              existingUser.activated = false
              existingUser.remoteId = `${existingUser.remoteId}_OVERWRITTEN_ON${new Date().getTime()}`
              existingUser.url = `${existingUser.url}_OVERWRITTEN_ON${new Date().getTime()}`
              await existingUser.save()

              if (userRes) {
                await mergeUsersQueue.add('mergeUsers', {
                  primaryUserId: userRes.id,
                  userToMergeId: existingUser.id
                })
              }

              await redisCache.del('userRemoteId:' + existingUser.remoteId)
            }
            if (userRes) {
              userRes.set(userData)
              await userRes.save()
              await clearUserCache(userRes.id)
            } else {
              redisCache.del('userRemoteId:' + actorUrl.toLocaleLowerCase())
            }
          }
        } else {
          if (existingUsers && existingUsers[0]) {
            existingUsers[0].set(userData)
            await existingUsers[0].save()
            await clearUserCache(existingUsers[0].id)
          } else {
            userRes = await User.create(userData)
          }
        }
        if (userRes && userRes.id && userRes.url != completeEnvironment.deletedUser && userPetition) {
          try {
            if (userPetition._wafrn_customCSS) {
              let customCSS: string | undefined = undefined
              logger.info({ id: userPetition.id }, 'found custom css for this user')
              if (URL.canParse(userPetition._wafrn_customCSS)) {
                const cssRes = await fetch(userPetition._wafrn_customCSS, {
                  headers: {
                    'User-Agent': getUserAgent('ActivityPubWorker')
                  }
                })
                if (cssRes.ok) customCSS = await cssRes.text()
              } else {
                customCSS = userPetition._wafrn_customCSS
              }
              if (customCSS) {
                const css = await processExternalCustomCss(userRes.id, customCSS)
                await writeFile(`uploads/themes/${userRes.id}.css`, css)
              }
            } else if (existsSync(`uploads/themes/${userRes.id}.css`)) {
              await unlink(`uploads/themes/${userRes.id}.css`)
            }
          } catch (e) {
            logger.warn(e)
          }

          try {
            if (userPetition.alsoKnownAs) {
              const atUri = (userPetition.alsoKnownAs as string[]).find(
                (x) => x.startsWith('did:') || x.startsWith('at://')
              )
              let mergeAcc = 0
              if (atUri) {
                const atDoc = await getDidDoc(atUri)
                if (
                  atDoc &&
                  (atDoc.alsoKnownAs?.includes(userPetition.id) ||
                    atDoc.alsoKnownAs?.includes(userPetition.id.replace('/fediverse/blog', '/blog')))
                ) {
                  // make it merged (wafrn user)
                  mergeAcc = 1
                } else if (atDoc && userPetition.id.includes('brid.gy/')) {
                  // check if bridgy fed
                  // we can't bridge bridged from web users so hard code to bsky.brid.gy
                  mergeAcc = 2
                }
                if (mergeAcc > 0) {
                  const oldUser = await User.findOne({
                    where: {
                      bskyDid: atUri.replace(/^at:\/\//, '')
                    }
                  })
                  if (oldUser) {
                    logger.info({ oldUser, userRes }, 'merging accs')
                    // put this in a queue so it wont lag entire instance
                    await mergeUsersQueue.add('mergeUsers', {
                      primaryUserId: mergeAcc === 2 ? oldUser.id : userRes.id,
                      userToMergeId: mergeAcc === 1 ? oldUser.id : userRes.id
                    })
                  }

                  // if bridgy user, to prevent more issues, return the existing bsky user instead
                  if (mergeAcc === 2) {
                    return (oldUser as User).id
                  }
                }
              }
            }
          } catch (e) {
            logger.warn(
              {
                error: e,
                userPetition
              },
              'cannot merge user'
            )
          }
        }
        if (userRes && userRes.id && userRes.url != completeEnvironment.deletedUser) {
          if (userPetition && userPetition.attachment && userPetition.attachment.length) {
            await UserOptions.destroy({
              where: {
                userId: userRes.id,
                optionName: {
                  [Op.like]: 'fediverse.public.attachment'
                }
              }
            })
            const properties = userPetition.attachment.filter((elem: any) => elem.type === 'PropertyValue')
            await UserOptions.create({
              userId: userRes.id,
              optionName: `fediverse.public.attachment`,
              optionValue: JSON.stringify(properties),
              public: true
            })
          }
          await UserOptions.destroy({
            where: {
              userId: userRes.id,
              optionName: 'wafrn.public.allowBitesFrom'
            }
          })
          const canBiteValues: string[] = userPetition?.canBite
            ? Array.isArray(userPetition.canBite)
              ? userPetition.canBite
              : [userPetition.canBite]
            : []
          const canBitePublic = canBiteValues.includes('https://www.w3.org/ns/activitystreams#Public')
          if (!canBitePublic) {
            const modes: string[] = []
            if (userPetition.followers && canBiteValues.includes(userPetition.followers)) {
              modes.push('2')
            }
            if (userPetition.following && canBiteValues.includes(userPetition.following)) {
              modes.push('3')
            }
            if (modes.length) {
              await UserOptions.create({
                userId: userRes.id,
                optionName: 'wafrn.public.allowBitesFrom',
                optionValue: modes.join(','),
                public: true
              })
            }
          }
        }
        res = userRes?.id ? userRes.id : await getDeletedUser()
        try {
          if (userRes) {
            const tags = userPetition?.tag
              ? Array.isArray(userPetition.tag)
                ? userPetition.tag
                : [userPetition.tag]
              : []
            const emojis = [...new Set(tags.filter((elem: fediverseTag) => elem.type === 'Emoji'))]
            await processUserEmojis(userRes, emojis)
          }
        } catch (error) {
          logger.info({
            message: `Error processing emojis from user ${userRes?.url}`,
            error: error,
            tags: userPetition?.tag,
            userPetition: userPetition
          })
        }
      }
    }
  }
  return typeof res === 'string' ? res : res?.id
}

export { getRemoteActorIdProcessor }
