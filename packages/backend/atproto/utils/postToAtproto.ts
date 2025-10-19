import { BskyAgent, RichText } from '@atproto/api'
import { Media, Post, PostMentionsUserRelation, Quotes, User } from '../../models/index.js'
import fs from 'fs/promises'
import { getPostUrlForQuote } from '../../utils/activitypub/postToJSONLD.js'
import RichtextBuilder from '@atcute/bluesky-richtext-builder'
import { Main } from '@atproto/api/dist/client/types/app/bsky/richtext/facet.js'
import { tokenize } from '@atcute/bluesky-richtext-parser'
import { removeMarkdown } from './removeMarkdown.js'
import optimizeMedia from '../../utils/optimizeMedia.js'
import dompurify from 'isomorphic-dompurify'
import ffmpeg from 'fluent-ffmpeg'
import { completeEnvironment } from '../../utils/backendOptions.js'

export async function getVideoAspectRatio(fileName: string) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(fileName, (err, metadata) => {
      if (err) {
        reject(err)
      } else {
        const stream = metadata.streams.find((s) => s.codec_type === 'video')
        if (stream) {
          resolve({
            width: stream.width,
            height: stream.height
          })
        } else {
          reject(new Error('No video stream found'))
        }
      }
    })
  })
}

async function postToAtproto(post: Post, agent: BskyAgent) {
  let labels: any = undefined
  const quotedPostId = await Quotes.findOne({
    where: {
      quoterPostId: post.id
    }
  })
  let bskyQuote
  let quotedPost
  if (quotedPostId) {
    quotedPost = await Post.findByPk(quotedPostId.quotedPostId, {
      include: [
        {
          model: User,
          as: 'user'
        }
      ]
    })
    if (quotedPost?.bskyUri) {
      bskyQuote = {
        $type: 'app.bsky.embed.record',
        record: {
          uri: quotedPost.bskyUri,
          cid: quotedPost.bskyCid
        }
      }
    }
  }

  const contentWarning = post.content_warning ? `[${post.content_warning.trim()}]\n` : ''
  const tags = (await post.getPostTags()).map((elem) => `#${elem.tagName.trim().replaceAll(' ', '-')}`).join(' ')
  let postText: string = dompurify.sanitize(
    (contentWarning + (post.markdownContent ? post.markdownContent.trim() : post.content.trim()) + ' ' + tags).trim(),
    {
      ALLOWED_TAGS: []
    }
  )

  if (quotedPost && !bskyQuote) {
    const remoteId = getPostUrlForQuote(quotedPost)
    postText = postText + '\nRE: ' + remoteId
  }

  const mentionedUserRelations = await PostMentionsUserRelation.findAll({
    where: {
      postId: post.id
    }
  })

  for (const mentionedRelation of mentionedUserRelations) {
    const user = await User.findByPk(mentionedRelation.userId)
    if (user) {
      const escapedUrl = user?.url.replaceAll(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
      let mentionRegex = new RegExp(`(?<=\\s|^)(@${escapedUrl})(?=\\s|$)`, 'gm')

      // Fedi users
      if (user.remoteMentionUrl) {
        // A Fedi user url already has an @ in the start
        mentionRegex = new RegExp(`(?<=\\s|^)(${escapedUrl})(?=\\s|$)`, 'gm')
        postText = postText.replaceAll(mentionRegex, `[@${user.shortHandle}](${user.remoteMentionUrl})`)
        continue
      }

      // Local users
      if (!user.isBlueskyUser) {
        if (user.bskyDid && user.enableBsky) {
          const response = await agent.getProfile({ actor: user.bskyDid })
          if (response.data) postText = postText.replaceAll(mentionRegex, `@${response.data.handle}`)
        } else {
          postText = postText.replaceAll(
            mentionRegex,
            `[@${user.url}](${completeEnvironment.frontendUrl}/fediverse/blog/${user.url.toLowerCase()})`
          )
        }
      }
    }
  }

  const ask = await post.getAsk()
  if (ask) {
    const userAsker = await User.findByPk(ask.userAsker)
    if (userAsker) {
      postText =
        `[${userAsker.name} asked:](https://${completeEnvironment.instanceUrl}/fediverse/post/${post.id}) ` +
        `${ask.question}\n\n${postText}`
    } else {
      postText =
        `[Anonymous asked:](https://${completeEnvironment.instanceUrl}/fediverse/post/${post.id}) ` +
        `${ask.question}\n\n${postText}`
    }
  }

  const medias = await Media.findAll({
    where: {
      postId: post.id
    }
  })

  let postShortened = false
  postText = removeMarkdown(postText)

  const builder = new RichtextBuilder()
  const encoder = new TextEncoder()

  const postMax = 300
  // A bit more to account for unicode and such
  const shortenerWithMediaLength = 31
  const textOnlyShortenerLength = 15

  const tokens = tokenize(postText)
  for (const token of tokens) {
    let text = builder.text
    if (token.type === 'link') text += token.text
    else text += token.raw

    const length = encoder.encode(text).byteLength
    if (length > postMax && medias.length && medias.length <= 4) {
      const lengthLeft = postMax - builder.text.length - shortenerWithMediaLength
      if (token.type === 'link') builder.addLink(token.text.slice(0, lengthLeft), token.url)
      else builder.addText(token.raw.slice(0, lengthLeft))

      builder.addText('... ')
      builder.addLink('see complete post', `https://${completeEnvironment.instanceUrl}/fediverse/post/${post.id}`)

      postShortened = true
      break
    } else if (length > postMax) {
      const lengthLeft = postMax - builder.text.length - textOnlyShortenerLength
      if (token.type === 'link') builder.addLink(token.text.slice(0, lengthLeft), token.url)
      else builder.addText(token.raw.slice(0, lengthLeft))

      builder.addText('[...]')
      postShortened = true
      break
    }

    if (token.type === 'link') builder.addLink(token.text, token.url)
    else builder.addText(token.raw)
  }
  postText = builder.text

  if (contentWarning != '' || medias.some((media) => media.NSFW)) {
    labels = {
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: 'graphic-media' }]
    }
  }

  const rt = new RichText({
    text: postText
  })
  await rt.detectFacets(agent)

  builder.facets.forEach((facet) => {
    if (rt.facets) rt.facets.push(facet as unknown as Main)
    else rt.facets = [facet as unknown as Main]
  })

  const sanitizedText = dompurify.sanitize(post.content, { ALLOWED_TAGS: [] })
  let res: any = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date(post.createdAt).toISOString(),
    fullText: sanitizedText,
    fullTags: tags,
    fediverseId: `${completeEnvironment.frontendUrl}/fediverse/post/${post.id}`
  }

  const bskyMediaPromises = medias.map(async (media) => {
    let file = await fs.readFile('uploads/' + media.url)
    const isVideo = media.mediaType?.startsWith('video/')

    if (!isVideo) {
      // yeah, 1 millon bytes is officially the limit:
      // https://github.com/bluesky-social/atproto/blob/80ada8f47628f55f3074cd16a52857e98d117e14/lexicons/app/bsky/embed/images.json#L24
      if (file.length > 1000000) {
        // well this image is TOO BIG. time to convert it
        await optimizeMedia('uploads/' + media.url, {
          outPath: 'uploads/' + media.id + '_bsky',
          // bluesky CDN resizes images to 2000 on the long end, try that first
          maxSize: 2000,
          keep: true
        })
        file = await fs.readFile('uploads/' + media.id + '_bsky.webp')
      }

      if (file.length > 1000000) {
        // still too big?! okay well let's crunch it
        await optimizeMedia('uploads/' + media.url, {
          outPath: 'uploads/' + media.id + '_bsky',
          maxSize: 768,
          keep: true
        })
        file = await fs.readFile('uploads/' + media.id + '_bsky.webp')
      }
    }

    const { data } = await agent.uploadBlob(Buffer.from(file), { encoding: media.mediaType || undefined })
    return { media, blob: data.blob }
  })

  if (bskyMediaPromises.length && bskyMediaPromises.length <= 4) {
    const bskyMedias = await Promise.all(bskyMediaPromises)
    const video = bskyMedias.find((media) => media.media.mediaType?.startsWith('video/'))

    if (video) {
      res.embed = {
        $type: 'app.bsky.embed.video',
        video: video.blob,
        alt: video.media.description ? video.media.description : '',
        labels,
        aspectRatio: await getVideoAspectRatio('uploads/' + video.media.url)
      }
    } else {
      res.embed = {
        $type: 'app.bsky.embed.images',
        images: bskyMedias.map((m) => ({
          labels,
          image: m.blob,
          alt: m.media.description ? m.media.description : '',
          aspectRatio: {
            width: m.media.width,
            height: m.media.height
          }
        }))
      }
    }
    // Shortening when media is present is handled earlier
  } else if (postShortened || bskyMediaPromises.length > 4) {
    res.embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: `https://${completeEnvironment.instanceUrl}/fediverse/post/${post.id}`,
        title: `See complete post at ${completeEnvironment.instanceUrl}`,
        description: `${completeEnvironment.instanceUrl} is a Wafrn server. Wafrn is a federated social media inspired by Tumblr, join us and have fun!`
      }
    }
  }

  if (post.parentId) {
    // ok this post is in reply to something
    const parent = await Post.findByPk(post.parentId)
    const ancestors = await post.getAncestors({
      where: {
        hierarchyLevel: 1
      }
    })

    const rootPost = ancestors[0]
    res.reply = {
      root: {
        uri: rootPost.bskyUri,
        cid: rootPost.bskyCid
      },
      parent: {
        uri: parent?.bskyUri,
        cid: parent?.bskyCid
      }
    }
  }

  if (bskyQuote) {
    // OK oK so turns out that posting video/images and quoting a post needs more consideration!
    if (res.embed) {
      res.embed = {
        $type: 'app.bsky.embed.recordWithMedia',
        media: res.embed,
        record: bskyQuote
      }
    } else {
      res.embed = bskyQuote
    }
  }

  if (labels) {
    res.labels = labels
  }

  return res
}

export { postToAtproto }
