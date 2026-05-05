import { Blocks, EmojiReaction, FederatedHost, Follows, Mutes, Post, PostMentionsUserRelation, sequelize, User, UserLikesPostRelations, UserOptions } from "../../models/index.js";
import { logger } from "../logger.js";
import { getUserIdFromRemoteId } from "../cacheGetters/getUserIdFromRemoteId.js";
import { getDeletedUser } from "../cacheGetters/getDeletedUser.js";
import { forcePopulateUsers } from "../../atproto/utils/getAtprotoUser.js";
import { redisCache } from "../redis.js";
import { completeEnvironment } from "../backendOptions.js";
import { writeFile, unlink } from "fs/promises";
import {existsSync} from "fs";
import { Op } from "sequelize";
import { fediverseTag } from "../../interfaces/fediverse/tags.js";
import { getDidDoc } from "../atproto/getDidDoc.js";
import getUserAgent from "../getUserAgent.js";
import processExternalCustomCss from "../processExternalCustomCss.js";
import { getPetitionSigned } from "./getPetitionSigned.js";
import { processUserEmojis } from "./processUserEmojis.js";
import { Queue } from "bullmq";


const mergeUsersQueue = new Queue('mergeUsers', {
  connection: completeEnvironment.bullmqConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 6,
    backoff: {
      type: 'exponential',
      delay: 25000
    },
    removeOnFail: false
  }
})

async function getRemoteActor(
  actorUrl: string | undefined,
  user: User | null,
  forceUpdate = false
): Promise<User | null> {
  if (!user) {
    logger.debug({
      message: `caled getremoteactor with null`,
    });
    return null;
  }
  let remoteUser;
  if (!actorUrl) {
    return await getDeletedUser();
  }
  try {
    // we check its a string. A little bit dirty but could be worse
    if (
      actorUrl
        .toLowerCase()
        .startsWith(completeEnvironment.frontendUrl + "/fediverse/blog/")
    ) {
      const urlToSearch = actorUrl
        .split(completeEnvironment.frontendUrl + "/fediverse/blog/")[1]
        .toLowerCase();
      return User.findOne({
        where: sequelize.where(
          sequelize.fn("lower", sequelize.col("url")),
          urlToSearch.toLowerCase()
        ),
      });
    }
    if (
      completeEnvironment.enableBsky &&
      actorUrl.toLowerCase().startsWith("at://")
    ) {
      // Bluesky user. This should only happen through an import
      const adminUser = (await User.findOne({
        where: {
          url: completeEnvironment.adminUser,
        },
      })) as User;
      await forcePopulateUsers([actorUrl.slice(5)], adminUser);
      return (
        User.findOne({
          where: {
            bskyDid: actorUrl.slice(5),
          },
        }) || (await getDeletedUser())
      );
    }
    let userId = await getUserIdFromRemoteId(actorUrl);
    if (userId === "") {
      const result = await getRemoteActorIdProcessor({
        actorUrl: actorUrl,
        userId: user.id,
        forceUpdate: forceUpdate,
      })
      if (result && result.id) {
        userId = result.id;
      } else {
        userId = (await getDeletedUser()).id;
      }
    }
    userId = userId == "" ? "00000000-0000-0000-0000-000000000000" : userId;
    remoteUser = await User.findByPk(userId);
    if (
      !remoteUser ||
      (remoteUser && remoteUser.banned) ||
      (remoteUser && (await remoteUser.getFederatedHost())?.blocked)
    ) {
      remoteUser = await getDeletedUser();
    }
  } catch (error) {
    logger.trace({
      message: `Error fetching user ${actorUrl}`,
      error: error,
    });
  }
  // update user if last update was more than 1 week ago
  if (remoteUser && remoteUser.url !== completeEnvironment.deletedUser) {
    const lastUpdate = new Date(remoteUser.updatedAt);
    const now = new Date();
    if (
      now.getTime() - lastUpdate.getTime() > 24 * 3600 * 1000 * 7 ||
      forceUpdate
    ) {
      getRemoteActorIdProcessor({ actorUrl: actorUrl, userId: user.id, forceUpdate: true })

    }
  }
  if (remoteUser) {
    await redisCache.del("key:" + remoteUser.remoteId);
  }
  return remoteUser ? remoteUser : await getDeletedUser();
}

export { getRemoteActor };


// TODO this is dirty, this function should be rewritten as satan intended.
async function getRemoteActorIdProcessor(data: {
  actorUrl: string,
  forceUpdate?: boolean,
  userId?: string
}) {
  const actorUrl: string = data.actorUrl
  const forceUpdate: boolean = data.forceUpdate == true
  const actorUrlId = await getUserIdFromRemoteId(actorUrl)
  let res = actorUrlId ? (await User.findByPk(actorUrlId)) as User : undefined
  let url = undefined
  const transaction = await sequelize.transaction()

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
  try {
    if (forceUpdate && url != undefined) {
    let federatedHost = await FederatedHost.findOne({
      transaction: transaction,
      where: sequelize.where(
        sequelize.fn('lower', sequelize.col('displayName')),
        url?.host ? url.host.toLowerCase() : ''
      )
    })
    const hostBanned = federatedHost?.blocked
    if (hostBanned) {
      res = await getDeletedUser()
    } else {
      const user = (await User.findByPk(data.userId, {transaction: transaction})) as User
      const userPetition = await getPetitionSigned(user, actorUrl)
      if (userPetition) {
        if (!federatedHost && url) {
          const federatedHostToCreate = {
            displayName: url.host.toLocaleLowerCase(),
            publicInbox: userPetition.endpoints?.sharedInbox ? userPetition.endpoints?.sharedInbox : ''
          }
          federatedHost = (await FederatedHost.findOrCreate({ where: federatedHostToCreate, transaction: transaction }))[0]
        }
        if (!url || !federatedHost) {
          logger.warn({
            message: 'Url is not valid wtf',
            trace: new Error().stack
          })
          await transaction.commit()
          return await getDeletedUser()
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
          displayUrl: Array.isArray(userPetition.url) ? userPetition.url[0] : userPetition.url,
          manuallyAcceptsFollows: userPetition.manuallyApprovesFollowers ?? false
        }
        federatedHost.publicInbox = userPetition.endpoints?.sharedInbox || null
        await federatedHost.save()
        let userRes
        const existingUsers = await User.findAll({
          transaction: transaction,
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
          if (res.id !== (await getDeletedUser()).id) {
            userRes = await User.findByPk(res.id, {transaction: transaction})
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
                const updates = [
                  Follows.update(
                    {
                      followerId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        followerId: existingUser.id
                      },
                    }
                  ),
                  Follows.update(
                    {
                      followedId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        followedId: existingUser.id
                      }
                    }
                  ),
                  Post.update(
                    {
                      userId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        userId: existingUser.id
                      }
                    }
                  ),
                  UserLikesPostRelations.update(
                    {
                      userId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        userId: existingUser.id
                      }
                    }
                  ),
                  EmojiReaction.update(
                    {
                      userId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        userId: existingUser.id
                      }
                    }
                  ),
                  Blocks.update(
                    {
                      blockedId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        blockedId: existingUser.id
                      }
                    }
                  ),
                  Blocks.update(
                    {
                      blockerId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        blockerId: existingUser.id
                      }
                    }
                  ),
                  Mutes.update(
                    {
                      muterId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        muterId: existingUser.id
                      }
                    }
                  ),
                  Mutes.update(
                    {
                      mutedId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        mutedId: existingUser.id
                      }
                    }
                  ),
                  PostMentionsUserRelation.update(
                    {
                      userId: userRes.id
                    },
                    {
                      transaction: transaction,
                      where: {
                        userId: existingUser.id
                      }
                    }
                  )
                ]
                await Promise.all(updates)
              }
              await redisCache.del('userRemoteId:' + existingUser.remoteId)
            }
            if (userRes) {
              userRes.set(userData)
              await userRes.save({
                transaction: transaction
              })
            } else {
              redisCache.del('userRemoteId:' + actorUrl.toLocaleLowerCase())
            }
          }
        } else {
          if (existingUsers && existingUsers[0]) {
            existingUsers[0].set(userData)
            await existingUsers[0].save({
              transaction: transaction,
            })
          } else {
            userRes = await User.create(userData,  {transaction: transaction,})
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
                    transaction: transaction,
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
                    await transaction.commit()
                    return oldUser
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
              transaction: transaction,
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
            },{
              transaction: transaction,
            })
          }
        }
        res = userRes?.id ? userRes : await getDeletedUser()
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
  } catch (error) {
    logger.error(error)
  }
  await transaction.commit()
  return res
}