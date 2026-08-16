import * as cheerio from 'cheerio'
import { Media } from '../models/index.js'
import { getQueue } from '../utils/queues.js'

const updateMediaDataQueue = getQueue('processRemoteMediaData')

// Finds <img>/<video>/<audio> tags embedded in remote post HTML, then converts it to ![media-1] format
export default async function extractMediaFromHtmlPost(
  postTextContent: string,
  medias: Media[],
  postPetition: any,
  ownerId: string | undefined
): Promise<string> {
  if (!ownerId || !postTextContent) {
    return postTextContent
  }
  const $ = cheerio.load(postTextContent, null, false)
  const elements = $('img, video, audio').toArray()
  if (elements.length === 0) {
    return postTextContent
  }
  const mediaOrderBase = Array.isArray(postPetition.attachment) ? postPetition.attachment.length : 0
  let inlineIndex = 0
  for (const el of elements) {
    const $el = $(el)
    const tagName = el.tagName?.toLowerCase()
    let url = $el.attr('src')
    if (!url && (tagName === 'video' || tagName === 'audio')) {
      url = $el.find('source[src]').first().attr('src')
    }
    if (!url) {
      continue
    }
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        continue
      }
    } catch {
      continue
    }
    const width = parseInt($el.attr('width') || '', 10)
    const height = parseInt($el.attr('height') || '', 10)
    const wafrnMedia = await Media.create({
      url,
      NSFW: postPetition?.sensitive,
      userId: ownerId,
      description: $el.attr('alt') || $el.attr('title') || '',
      ipUpload: 'MEDIA_FROM_POST_CONTENT_FROM_ANOTHER_INSTANCE',
      mediaOrder: mediaOrderBase + inlineIndex,
      external: true,
      mediaType: null,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null
    } as any)
    await updateMediaDataQueue.add(`updateMedia:${wafrnMedia.id}`, {
      mediaId: wafrnMedia.id
    })
    const placeholderIndex = medias.length + 1
    medias.push(wafrnMedia)
    $el.replaceWith(`![media-${placeholderIndex}]`)
    inlineIndex++
  }
  return $.html()
}
