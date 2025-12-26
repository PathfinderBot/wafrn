import { completeEnvironment } from '../backendOptions.js'
import { User } from '../../models/index.js'
import { getUserEmojis } from '../cacheGetters/getUserEmojis.js'
import { getUserOptions } from '../cacheGetters/getUserOptions.js'
import { logger } from '../logger.js'
import { redisCache } from '../redis.js'
import { emojiToAPTag } from './emojiToAPTag.js'
import { existsSync } from 'fs'

export async function userToJSONLD(user: User) {
  // test remove cache
  const userCacheResult = undefined //await redisCache.get('fediverse:user:base:' + user.id)
  let userForFediverse: any
  if (userCacheResult) {
    userForFediverse = JSON.parse(userCacheResult)
  } else {
    let emojisPromise = getUserEmojis(user.id)
    let userOptionsPromise = getUserOptions(user.id)
    await Promise.all([emojisPromise, userOptionsPromise])
    const emojis = await emojisPromise
    const userOptions = await userOptionsPromise
    let unprocessedAttachments = userOptions.find((elem) => elem.optionName === 'fediverse.public.attachment')
    let alsoKnownAs: any[] = []
    let alsoKnownAsList = userOptions.find((elem) => elem.optionName === 'fediverse.public.alsoKnownAs')
    if (alsoKnownAsList?.optionValue) {
      try {
        const parsedValue = alsoKnownAsList?.optionValue
        if (typeof parsedValue === 'string') {
          for (let elem of parsedValue.split(',')) {
            let url = new URL(elem.replaceAll('"', ''))
            alsoKnownAs.push(url.toString())
          }
        }
      } catch (error) {
        logger.debug({
          message: 'Error parsing alsoknownas',
          error: error
        })
      }
    }
    if (user.bskyDid) {
      alsoKnownAs.push(`at://${user.bskyDid}`)
    }
    let attachments: { type: string; name: string; value: string }[] = []
    if (unprocessedAttachments) {
      try {
        const attachmentsArray: { name: string; value: string }[] = JSON.parse(unprocessedAttachments.optionValue)
        attachments = attachmentsArray.map((elem) => {
          return { ...elem, type: 'PropertyValue' }
        })
      } catch (error) {
        logger.debug({
          message: `Error parsing attachment for user ${user.url}`,
          error: error
        })
      }
    }
    let customCSS: string | undefined = undefined
    if (existsSync(`uploads/themes/${user.id}.css`)) {
      customCSS = new URL(`/api/uploads/themes/${user.id}.css`, completeEnvironment.frontendUrl).href
    }
    userForFediverse = {
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
      type: user.isBot ? 'Service' : 'Person',
      attachment: attachments,
      following: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following`,
      followers: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/followers`,
      featured: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/featured`,
      inbox: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/inbox`,
      outbox: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/outbox`,
      preferredUsername: user.url.toLowerCase(),
      name: user.name,
      summary: user.description,
      ...(!!user.userMigratedTo ? {
        movedTo: user.userMigratedTo
      } : {}),
      ...(customCSS ? {
        _wafrn_customCSS: customCSS
      } : {}),
      url: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
      manuallyApprovesFollowers: user.manuallyAcceptsFollows,
      discoverable: true,
      alsoKnownAs: alsoKnownAs,
      published: user.createdAt,
      tag: emojis.map((emoji: any) => emojiToAPTag(emoji)),
      endpoints: {
        sharedInbox: `${completeEnvironment.frontendUrl}/fediverse/sharedInbox`
      },
      ...(user.avatar
        ? {
          icon: {
            type: 'Image',
            mediaType: 'image/webp',
            url: completeEnvironment.mediaUrl + user.avatar
          }
        }
        : undefined),
      ...(user.headerImage
        ? {
          image: {
            type: 'Image',
            mediaType: 'image/webp',
            url: completeEnvironment.mediaUrl + user.headerImage
          }
        }
        : undefined),
      publicKey: {
        id: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}#main-key`,
        owner: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}`,
        publicKeyPem: user.publicKey
      }
    }

    if (user.userMigratedTo) {
      userForFediverse.migratedTo = user.userMigratedTo
    }
    await redisCache.set('fediverse:user:base:' + user.id, JSON.stringify(userForFediverse), 'EX', 300)
  }
  return userForFediverse
}
