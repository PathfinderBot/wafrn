import { completeEnvironment } from '../utils/backendOptions.js'
import { User } from '../models/index.js'
import { getUserEmojis } from '../utils/cacheGetters/getUserEmojis.js'
import { getUserOptions } from '../utils/cacheGetters/getUserOptions.js'
import { logger } from '../utils/logger.js'
import { redisCache } from '../utils/redis.js'
import { emojiToAPTag } from './emojiToAPTag.js'
import { existsSync } from 'fs'
import showdown from 'showdown'
import sanitizeHtml from 'sanitize-html'

const attachmentMarkdownConverter = new showdown.Converter({
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: true,
  encodeEmails: false
})

function attachmentValueToHtml(value: string): string {
  // showdown always wraps output in a <p>, which we don't need
  const html = attachmentMarkdownConverter
    .makeHtml(value)
    .replace(/^<p>/, '')
    .replace(/<\/p>\s*$/, '')
    .trim()
  return sanitizeHtml(html, {
    allowedTags: ['a', 'br'],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel']
    }
  })
}

export async function userToJSONLD(user: User) {
  // test remove cache
  const userCacheResult = await redisCache.get('fediverse:user:base:' + user.id)
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
        logger.trace({
          message: 'Error parsing alsoknownas',
          error: error,
          value: alsoKnownAsList?.optionValue,
          user: user.url
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
          return { ...elem, value: attachmentValueToHtml(elem.value), type: 'PropertyValue' }
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
    // 1 = everyone (default), 2 = people who follow this user, 3 = people this user follows
    const allowBitesOption = userOptions.find((elem) => elem.optionName === 'wafrn.public.allowBitesFrom')
    const allowBitesFromValue = allowBitesOption?.optionValue || '1'
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
      ...(!!user.userMigratedTo
        ? {
            movedTo: user.userMigratedTo
          }
        : {}),
      ...(customCSS
        ? {
            _wafrn_customCSS: customCSS
          }
        : {}),
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
      },
      ...(allowBitesFromValue === '1'
        ? { canBite: 'https://www.w3.org/ns/activitystreams#Public' }
        : allowBitesFromValue === '3'
          ? { canBite: `${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()}/following` }
          : {})
    }

    if (user.userMigratedTo) {
      userForFediverse.migratedTo = user.userMigratedTo
    }
    await redisCache.set('fediverse:user:base:' + user.id, JSON.stringify(userForFediverse), 'EX', 60)
  }
  return userForFediverse
}
