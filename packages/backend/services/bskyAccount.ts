import { $Typed, AppBskyActorProfile, AtpAgent, BskyAgent } from '@atproto/api'
import { SelfLabels } from '@atproto/api/dist/client/types/com/atproto/label/defs.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'fs/promises'
import dompurify from 'isomorphic-dompurify'
import { User, UserOptions } from '../models/index.js'
import { updateUserDidDoc } from '../atproto/utils/updateUserDidDoc.js'
import { getPdsServiceUrl } from '../atproto/utils/getPdsServiceUrl.js'
import { completeEnvironment } from '../utils/backendOptions.js'
import generateRandomString from '../utils/generateRandomString.js'
import { logger } from '../utils/logger.js'
import optimizeMedia from '../utils/optimizeMedia.js'
import { redisCache } from '../utils/redis.js'
import { wait } from '../utils/wait.js'

const serviceUrl = completeEnvironment.bskyPds ? getPdsServiceUrl() : ''

async function updateBlueskyProfile(agent: BskyAgent, user: User) {
  try {
    await updateUserDidDoc(user)
    let pronouns: string | undefined
    let website: string | undefined
    const fediAttachmentsDb = await UserOptions.findOne({
      where: {
        userId: user.id,
        optionName: 'fediverse.public.attachment'
      }
    })

    if (fediAttachmentsDb) {
      const fediAttachments: { name: string; value: string }[] = JSON.parse(fediAttachmentsDb.optionValue)
      pronouns = fediAttachments.find((elem) => elem.name.toLowerCase() === 'pronouns')?.value
      const websiteCheck = fediAttachments.find((elem) => elem.name.toLowerCase() === 'website')?.value

      if (websiteCheck) {
        const doc = cheerio.load(websiteCheck)
        const anchor = doc('a')
        if (anchor) {
          website = anchor.attr('href')
        }
        if (!anchor || !website) {
          website = websiteCheck
        }
      }
    }

    return await agent.upsertProfile(async (existingProfile) => {
      const profile = existingProfile ?? ({} as AppBskyActorProfile.Record)
      const fullProfileString = `\n\nView full profile at ${completeEnvironment.frontendUrl}/blog/${user.url}`
      profile.displayName = user.name
        .replace(/:[\S]+:/gm, '')
        .substring(0, 63)
        .trim()
      profile.description =
        dompurify.sanitize(
          user.descriptionMarkdown ? user.descriptionMarkdown.substring(0, 248 - fullProfileString.length) : '',
          { ALLOWED_TAGS: [] }
        ) +
        '[...]' +
        fullProfileString
      if (user.avatar) {
        let pngAvatar = await optimizeMedia('uploads' + user.avatar, {
          forceImageExtension: 'png',
          maxSize: 512,
          keep: true,
          disableAnimation: true
        })
        const userAvatarFile = Buffer.from(await fs.readFile(pngAvatar))
        const avatarUpload = await agent.uploadBlob(userAvatarFile, {
          encoding: 'image/png'
        })
        const avatarData = avatarUpload.data.blob
        profile.avatar = avatarData
        await fs.unlink(pngAvatar)
      }
      if (pronouns) {
        profile.pronouns = pronouns
      }
      if (website) {
        profile.website = website
      }
      // it works now yay
      if (user.headerImage) {
        let jpegHeader = await optimizeMedia('uploads' + user.headerImage, {
          forceImageExtension: 'jpg',
          keep: true
        })
        const userHeaderFile = Buffer.from(await fs.readFile(jpegHeader))
        const headerUpload = await agent.uploadBlob(userHeaderFile, {
          encoding: 'image/jpeg'
        })
        const headerData = headerUpload.data.blob
        profile.banner = headerData
        await fs.unlink(jpegHeader)
      }
      if (user.hideProfileNotLoggedIn) {
        profile.labels = {
          $type: 'com.atproto.label.defs#selfLabels',
          values: [
            {
              val: '!no-unauthenticated'
            },
            ...(profile.labels ? (profile.labels as $Typed<SelfLabels>).values : [])
          ]
        }
      } else {
        profile.labels = {
          $type: 'com.atproto.label.defs#selfLabels',
          values: [
            ...(profile.labels
              ? (profile.labels as $Typed<SelfLabels>).values.filter((x) => x.val !== '!no-unauthenticated')
              : [])
          ]
        }
      }

      return profile
    })
  } catch (error) {
    logger.error({
      message: `Error updatig bsky profile: ${user.url}`,
      error
    })
  }
}

async function pinPostOnBluesky(agent: BskyAgent, uri: string, cid: string) {
  try {
    return await agent.upsertProfile(async (existingProfile) => {
      const profile = existingProfile ?? ({} as AppBskyActorProfile.Record)
      if (uri && cid) {
        profile.pinnedPost = { uri, cid }
      } else {
        delete profile.pinnedPost
      }
      return profile
    })
  } catch (error) {
    logger.error({
      message: `Error pinning post on bluesky`,
      uri,
      error
    })
  }
}

async function createBskyAccount({
  agent,
  user,
  password,
  inviteCode,
  url
}: {
  agent: AtpAgent
  user: User
  password: string
  inviteCode: string
  url?: string
}) {
  const pdsHandleUrl = completeEnvironment.bskyPdsUrl.startsWith('http')
    ? completeEnvironment.bskyPdsUrl.replace('https://', '').replace('http://', '')
    : completeEnvironment.bskyPdsUrl

  const sanitizedUrl = url ? url : user.url.replaceAll('_', '-').replaceAll('.', '-').substring(0, 17)

  // this try-catch block does not catch very much, it is only used to add the error to the logger.
  try {
    // the createAccount method will also login as the newly created user.
    const accountCreation = await agent.createAccount({
      email: user.email as string,
      handle: `${sanitizedUrl}.${pdsHandleUrl}`,
      password,
      inviteCode
    })
    logger.info({
      message: `Bsky account created for ${user.url}`,
      response: accountCreation
    })
    user.bskyDid = agent.assertDid
    await user.save()
  } catch (error) {
    logger.error({
      message: `Bsky account creation failed for ${user.url}`,
      error: error
    })
    throw error
  }
}

async function createBskyAppPassword(user: User, agent: AtpAgent, forceLog?: boolean) {
  const appPasswordsList = await agent.com.atproto.server.listAppPasswords()
  for await (const element of appPasswordsList.data.passwords) {
    if (element.name.includes('wafrn')) {
      await agent.com.atproto.server.revokeAppPassword({
        name: element.name
      })
      await wait(50)
    }
  }
  const appPasswordResponse = await agent.com.atproto.server.createAppPassword({
    name: 'wafrn app password DO NOT DELETE ' + generateRandomString(),
    privileged: true
  })

  if (!appPasswordResponse.success) {
    logger.error({
      message: `Error creating bluesky app password for user ${user.url}`,
      response: appPasswordResponse
    })
    return false
  }

  const appPassword = appPasswordResponse.data.password

  user.bskyAuthData = null
  user.bskyAppPassword = appPassword
  user.enableBsky = true
  await user.save()
  await updateUserDidDoc(user)
  if (forceLog) {
    logger.info(`Forced app password on user ${user.url}`)
  }
  await redisCache.del('bskySession:' + user.id)
  return true
}

async function createBskyInviteCode(): Promise<string> {
  const authString = Buffer.from('admin:' + completeEnvironment.bskyPdsAdminPassword).toString('base64')
  const reply: { data: { code: string } } = await axios.post(
    serviceUrl + '/xrpc/com.atproto.server.createInviteCode',
    { useCount: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + authString
      }
    }
  )
  return reply.data.code
}

async function updateBskyPassword(user: User, password: string) {
  const authString = Buffer.from('admin:' + completeEnvironment.bskyPdsAdminPassword).toString('base64')
  return await axios.post(
    serviceUrl + '/xrpc/com.atproto.admin.updateAccountPassword',
    { did: user.bskyDid, password: password },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + authString
      }
    }
  )
}

async function forceUpdateBskyEmail(userIncomplete: User) {
  const authString = Buffer.from('admin:' + completeEnvironment.bskyPdsAdminPassword).toString('base64')
  const fullUser = (await User.scope('full').findByPk(userIncomplete.id)) as User
  return await axios.post(
    serviceUrl + '/xrpc/com.atproto.admin.updateAccountEmail',
    { account: fullUser.bskyDid, email: fullUser.email },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + authString
      }
    }
  )
}

export {
  serviceUrl,
  updateBlueskyProfile,
  pinPostOnBluesky,
  createBskyAccount,
  createBskyAppPassword,
  createBskyInviteCode,
  updateBskyPassword,
  forceUpdateBskyEmail
}
